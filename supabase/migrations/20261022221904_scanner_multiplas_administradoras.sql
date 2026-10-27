-- Ampliação independente das filas de captação. Credenciais continuam nas receitas.
alter table public.scanner_configuracoes
 add column portal text not null default 'lello' check(portal in ('lello','manager','bbz','graiche','sell','atipass','hflex','oma','verti','habitacional','villagua','outro')),
 add column receita_id uuid references public.agente_receitas(id),
 add column situacao text not null default 'validado' check(situacao in ('validado','aguardando_primeira_coleta','pendente_acesso','pendente_adaptador','sem_unidades'));
alter table public.scanner_configuracoes drop constraint scanner_configuracoes_unidades_check;
alter table public.scanner_configuracoes add constraint scanner_configuracoes_unidades_check
 check(cardinality(unidades) between 0 and 1000 and (not ativo or cardinality(unidades)>0));
create index scanner_configuracoes_receita on public.scanner_configuracoes(receita_id) where receita_id is not null;

create or replace function public.scanner_reivindicar(p_token uuid) returns setof public.scanner_configuracoes
language plpgsql security invoker set search_path=public as $$
declare v public.scanner_configuracoes; c public.scanner_controle; horario time;
begin
 if p_token is null then raise exception 'Token obrigatório'; end if;
 horario := (now() at time zone 'America/Sao_Paulo')::time;
 if horario < time '00:30' or horario >= time '05:25' then return; end if;
 select * into c from public.scanner_controle where id for update;
 if c.proxima_execucao > now() or c.reservado_ate > now() then return; end if;
 if c.token is not null then
   update public.scanner_controle set token=null,reservado_ate=null,proxima_execucao=now()+interval '30 minutes' where id;
   return;
 end if;
 select s.* into v from public.scanner_configuracoes s join public.condominios d on d.id=s.condominio_id
 where s.ativo and s.situacao in ('validado','aguardando_primeira_coleta') and s.proxima_execucao<=now() and d.status='ativo' and (
   (s.portal='lello' and (lower(d.administradora)='lello' or (
     d.id='13290a44-ec8d-4232-81e7-711196547f91'::uuid and lower(d.administradora)='hubert/lello' and s.codigo_portal='62430'
   ))) or exists (
     select 1 from public.agente_receitas r where r.id=s.receita_id
     and r.config_json->>'condominio_id'=d.id::text and (
       (s.portal='manager' and lower(d.administradora)='manager' and r.script_key='manager_atentum_cotas_pendentes' and r.config_json->>'codigo_cliente'=s.codigo_portal)
       or (s.portal='bbz' and lower(d.administradora)='bbz' and r.script_key='bbz_condopro_clock_vila_romana' and coalesce(r.config_json->>'coleta_segmentada','false')<>'true')
       or (s.portal='graiche' and lower(d.administradora)='graiche' and r.script_key='captacao_graiche')
       or (s.portal='sell' and lower(d.administradora)='sell' and r.script_key='captacao_sell')
     )
   )
 )
 order by s.proxima_execucao,s.id limit 1 for update of s skip locked;
 if not found then return; end if;
 update public.scanner_controle set token=p_token,configuracao_id=v.id,reservado_ate=now()+interval '5 minutes' where id;
 return next v;
end $$;
revoke all on function public.scanner_reivindicar(uuid) from public,anon,authenticated;
grant execute on function public.scanner_reivindicar(uuid) to service_role;

-- Todos os condomínios ativos entram no painel; somente adaptadores prontos recebem lotes.
-- Não modifica cursor, evidências, pausas ou acessos dos nove scanners existentes.
with candidatos as (
 select d.id,d.carteira_id,d.administradora,r.id receita_id,r.script_key,r.config_json,
 case r.script_key when 'manager_atentum_cotas_pendentes' then 'manager'
 when 'bbz_condopro_clock_vila_romana' then 'bbz' when 'captacao_graiche' then 'graiche'
 when 'captacao_sell' then 'sell' when 'captacao_atipass' then 'atipass' when 'captacao_hflex' then 'hflex'
 when 'captacao_habitacional' then 'habitacional' when 'villagua_condopro_square_guarulhos' then 'villagua'
 when 'verti_winker_inadimplencia' then case when lower(d.administradora)='oma' then 'oma' else 'verti' end
 else 'outro' end portal,
 coalesce((select array_agg(u.id::text order by coalesce(u.bloco,''),u.identificacao,u.id) from public.unidades u where u.condominio_id=d.id and u.carteira_id=d.carteira_id),'{}') unidades
 from public.condominios d
 left join lateral (select r.* from public.agente_receitas r where r.config_json->>'condominio_id'=d.id::text
 order by (r.carteira_id=d.carteira_id) desc,r.ativo desc,r.updated_at desc,r.id limit 1) r on true
 where d.status='ativo' and coalesce(lower(d.administradora),'') not in ('lello','hubert/lello')
), classificados as (
 select *, case when cardinality(unidades)=0 then 'sem_unidades'
 when receita_id is null then 'pendente_acesso'
 when portal='manager' and coalesce(config_json->>'codigo_cliente','') ~ '^[0-9]{1,10}$' then 'aguardando_primeira_coleta'
 when portal='bbz' and coalesce(config_json->>'coleta_segmentada','false')<>'true'
 and nullif(coalesce(config_json->>'titulo_portal_validado',config_json->>'condominio_portal'),'') is not null then 'aguardando_primeira_coleta'
 else 'pendente_adaptador' end situacao from candidatos where cardinality(unidades)<=1000
)
insert into public.scanner_configuracoes(condominio_id,codigo_portal,perfil_acesso,unidades,ativo,portal,receita_id,situacao,ultimo_resultado)
select id,case when portal='manager' and config_json->>'codigo_cliente' ~ '^[0-9]{1,10}$' then config_json->>'codigo_cliente' else '0' end,
 upper(portal),unidades,situacao='aguardando_primeira_coleta',portal,receita_id,situacao,
 case situacao when 'aguardando_primeira_coleta' then 'Incluído na fila noturna; acesso e vínculo serão conferidos antes de cada consulta.'
 when 'pendente_acesso' then 'Incluído; falta acesso de portal configurado para este condomínio.'
 when 'sem_unidades' then 'Incluído; condomínio sem unidades cadastradas para enriquecer.'
 else 'Incluído; consulta cadastral deste portal ou seleção segmentada ainda exige validação do adaptador.' end
from classificados on conflict(condominio_id) do nothing;

-- As novas fontes vinculam o UUID interno após conferir bloco/unidade no portal.
create or replace function public.scanner_aplicar_contato(p_evidencia uuid,p_contato jsonb) returns jsonb
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
 and ((s.portal='lello' and upper(trim(identificacao))=upper(e.unidade_portal) and coalesce(trim(bloco),'') in ('','0','00','000','SEM BLOCO')) or (s.portal<>'lello' and id::text=e.unidade_portal));
 if n<>1 then
   resultado:='revisao_vinculo';
   insert into public.scanner_cadastro_auditoria(evidencia_id,resultado) values(e.id,resultado);
   update public.scanner_evidencias set cadastro_status=resultado where id=e.id;
   return jsonb_build_object('resultado',resultado);
 end if;
 select * into u from public.unidades where condominio_id=c.id and carteira_id=c.carteira_id
 and ((s.portal='lello' and upper(trim(identificacao))=upper(e.unidade_portal) and coalesce(trim(bloco),'') in ('','0','00','000','SEM BLOCO')) or (s.portal<>'lello' and id::text=e.unidade_portal)) for update;
 antes:=jsonb_build_object('unidade',jsonb_build_object('responsavel_nome',u.responsavel_nome,'responsavel_documento',u.responsavel_documento,'telefone',u.telefone,'email',u.email));
 if nullif(u.responsavel_documento,'') is not null and nullif(p_contato->>'documento','') is null
 and upper(trim(u.responsavel_nome)) is distinct from upper(trim(p_contato->>'nome')) then
   insert into public.scanner_cadastro_auditoria(evidencia_id,unidade_id,resultado,antes) values(e.id,u.id,'revisao_identidade',antes);
   update public.scanner_evidencias set cadastro_status='revisao_identidade' where id=e.id;
   return jsonb_build_object('resultado','revisao_identidade');
 end if;
 -- Só sincroniza um apoio inequívoco; não troca contatos de coproprietários ou de terceiros.
 select count(*) into n from public.responsaveis_unidades where ativo and condominio_id=c.id and carteira_id=c.carteira_id
 and upper(trim(unidade))=upper(trim(u.identificacao)) and coalesce(trim(bloco),'')=coalesce(trim(u.bloco),'')
 and upper(trim(responsavel_nome)) in (upper(trim(u.responsavel_nome)),upper(trim(p_contato->>'nome')));
 if n=1 then
   select * into r from public.responsaveis_unidades where ativo and condominio_id=c.id and carteira_id=c.carteira_id
   and upper(trim(unidade))=upper(trim(u.identificacao)) and coalesce(trim(bloco),'')=coalesce(trim(u.bloco),'')
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
