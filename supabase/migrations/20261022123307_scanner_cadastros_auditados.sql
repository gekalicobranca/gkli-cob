-- Somente cadastros. Não altera cobranças, acordos, parcelas ou filas de mensagens.
alter table public.scanner_evidencias add column cadastro_status text not null default 'pendente';
create index scanner_contatos_pendentes on public.scanner_evidencias(coletado_em desc,id)
 where tipo='contatos' and cadastro_status='pendente';
create table public.scanner_cadastro_auditoria (
 evidencia_id uuid primary key references public.scanner_evidencias(id),
 unidade_id uuid references public.unidades(id),
 resultado text not null, antes jsonb, depois jsonb,
 atualizado_em timestamptz not null default now()
);
alter table public.scanner_cadastro_auditoria enable row level security;
revoke all on public.scanner_cadastro_auditoria from public,anon,authenticated;
grant select on public.scanner_cadastro_auditoria to authenticated;
grant all on public.scanner_cadastro_auditoria to service_role;
create policy scanner_cadastro_auditoria_admin on public.scanner_cadastro_auditoria for select to authenticated
 using ((select public.current_user_is_admin()));

create function public.scanner_aplicar_contato(p_evidencia uuid,p_contato jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare e public.scanner_evidencias; s public.scanner_configuracoes; u public.unidades; r public.responsaveis_unidades;
 c public.condominios; ficha jsonb; n integer; rid uuid; antes jsonb; depois jsonb; resultado text; campo text; valor text;
begin
 select * into e from public.scanner_evidencias where id=p_evidencia for update;
 if not found or e.tipo<>'contatos' then raise exception 'Evidência de contatos inexistente'; end if;
 if e.cadastro_status<>'pendente' then return jsonb_build_object('resultado',e.cadastro_status); end if;
 select * into s from public.scanner_configuracoes where id=e.configuracao_id;
 select * into c from public.condominios where id=s.condominio_id;
 if not s.ativo or c.status<>'ativo' or e.dados->>'codigo' is distinct from s.codigo_portal
 or e.dados->>'unidade' is distinct from e.unidade_portal
 or not(e.unidade_portal=any(s.unidades)) then raise exception 'Escopo do contato inválido'; end if;
 select count(*) into n from jsonb_array_elements(e.dados->'fichas') f where f->>'Unidade'=e.unidade_portal;
 if n<>1 then raise exception 'Ficha principal não é única'; end if;
 select f into ficha from jsonb_array_elements(e.dados->'fichas') f where f->>'Unidade'=e.unidade_portal;
 if nullif(trim(p_contato->>'nome'),'') is null or p_contato->>'nome' is distinct from regexp_replace(trim(ficha->>'Nome'),'\s+',' ','g') then raise exception 'Responsável diverge da evidência'; end if;
 if nullif(p_contato->>'documento','') is not null and (p_contato->>'documento' !~ '^([0-9]{11}|[0-9]{14})$'
 or p_contato->>'documento' not in (regexp_replace(coalesce(ficha->>'CPF',''),'[^0-9]','','g'),regexp_replace(coalesce(ficha->>'CNPJ',''),'[^0-9]','','g'))) then raise exception 'Documento diverge da evidência'; end if;
 foreach campo in array array['telefone','celular','telefone_fixo','telefone_outros'] loop
   valor:=nullif(p_contato->>campo,'');
   if valor is not null and valor !~ '^55[0-9]{10,11}( \| 55[0-9]{10,11})*$' then raise exception 'Telefone inválido'; end if;
 end loop;
 if exists(select 1 from regexp_split_to_table(coalesce(p_contato->>'email',''),' \| ') email where email<>'' and email !~ '^[^@<>[:space:]]+@[^@<>[:space:]]+\.[^@<>[:space:]]+$') then raise exception 'E-mail inválido'; end if;
 if exists(select 1 from public.scanner_evidencias x where x.configuracao_id=e.configuracao_id and x.unidade_portal=e.unidade_portal and x.tipo='contatos' and (x.coletado_em,x.id)>(e.coletado_em,e.id)) then
   update public.scanner_evidencias set cadastro_status='superado' where id=e.id;
   return jsonb_build_object('resultado','superado');
 end if;
 -- Sem heurística de bloco ou zeros: o código completo precisa identificar uma unidade já existente.
 select count(*) into n from public.unidades where condominio_id=c.id and carteira_id=c.carteira_id
 and upper(trim(identificacao))=upper(e.unidade_portal) and coalesce(trim(bloco),'') in ('','0','00','000','SEM BLOCO');
 if n<>1 then
   resultado:='revisao_vinculo';
   insert into public.scanner_cadastro_auditoria(evidencia_id,resultado) values(e.id,resultado);
   update public.scanner_evidencias set cadastro_status=resultado where id=e.id;
   return jsonb_build_object('resultado',resultado);
 end if;
 select * into u from public.unidades where condominio_id=c.id and carteira_id=c.carteira_id
 and upper(trim(identificacao))=upper(e.unidade_portal) and coalesce(trim(bloco),'') in ('','0','00','000','SEM BLOCO') for update;
 antes:=jsonb_build_object('unidade',jsonb_build_object('responsavel_nome',u.responsavel_nome,'responsavel_documento',u.responsavel_documento,'telefone',u.telefone,'email',u.email));
 if nullif(u.responsavel_documento,'') is not null and nullif(p_contato->>'documento','') is null
 and upper(trim(u.responsavel_nome)) is distinct from upper(trim(p_contato->>'nome')) then
   insert into public.scanner_cadastro_auditoria(evidencia_id,unidade_id,resultado,antes) values(e.id,u.id,'revisao_identidade',antes);
   update public.scanner_evidencias set cadastro_status='revisao_identidade' where id=e.id;
   return jsonb_build_object('resultado','revisao_identidade');
 end if;
 -- Só sincroniza um apoio inequívoco; não troca contatos de coproprietários ou de terceiros.
 select count(*) into n from public.responsaveis_unidades where ativo and condominio_id=c.id and carteira_id=c.carteira_id
 and upper(trim(unidade))=upper(e.unidade_portal) and coalesce(trim(bloco),'') in ('','0','00','000','SEM BLOCO')
 and upper(trim(responsavel_nome)) in (upper(trim(u.responsavel_nome)),upper(trim(p_contato->>'nome')));
 if n=1 then
   select * into r from public.responsaveis_unidades where ativo and condominio_id=c.id and carteira_id=c.carteira_id
   and upper(trim(unidade))=upper(e.unidade_portal) and coalesce(trim(bloco),'') in ('','0','00','000','SEM BLOCO')
   and upper(trim(responsavel_nome)) in (upper(trim(u.responsavel_nome)),upper(trim(p_contato->>'nome'))) for update;
   rid:=r.id;antes:=antes||jsonb_build_object('responsavel',to_jsonb(r)-'updated_at');
 end if;
 update public.unidades set responsavel_nome=p_contato->>'nome',responsavel_documento=coalesce(nullif(p_contato->>'documento',''),responsavel_documento),telefone=coalesce(nullif(p_contato->>'telefone',''),telefone),
 email=coalesce(nullif(p_contato->>'email',''),email),updated_at=now() where id=u.id and
 (responsavel_nome,responsavel_documento,telefone,email) is distinct from (p_contato->>'nome',coalesce(nullif(p_contato->>'documento',''),responsavel_documento),coalesce(nullif(p_contato->>'telefone',''),telefone),coalesce(nullif(p_contato->>'email',''),email));
 if rid is not null then
   update public.responsaveis_unidades set responsavel_nome=p_contato->>'nome',responsavel_documento=coalesce(nullif(p_contato->>'documento',''),responsavel_documento),
   telefone=coalesce(nullif(p_contato->>'telefone',''),telefone),celular=coalesce(nullif(p_contato->>'celular',''),celular),
   telefone_fixo=coalesce(nullif(p_contato->>'telefone_fixo',''),telefone_fixo),telefone_outros=coalesce(nullif(p_contato->>'telefone_outros',''),telefone_outros),
   email=coalesce(nullif(p_contato->>'email',''),email),updated_at=now() where id=rid;
 end if;
 select jsonb_build_object('unidade',jsonb_build_object('responsavel_nome',responsavel_nome,'responsavel_documento',responsavel_documento,'telefone',telefone,'email',email)) into depois from public.unidades where id=u.id;
 if rid is not null then select depois||jsonb_build_object('responsavel',to_jsonb(x)-'updated_at') into depois from public.responsaveis_unidades x where x.id=rid;end if;
 resultado:=case when antes=depois then 'sem_alteracao' else 'atualizado' end;
 insert into public.scanner_cadastro_auditoria(evidencia_id,unidade_id,resultado,antes,depois) values(e.id,u.id,resultado,antes,depois);
 update public.scanner_evidencias set cadastro_status=resultado where id=e.id;
 return jsonb_build_object('resultado',resultado,'unidade_id',u.id);
end $$;
revoke all on function public.scanner_aplicar_contato(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.scanner_aplicar_contato(uuid,jsonb) to service_role;
