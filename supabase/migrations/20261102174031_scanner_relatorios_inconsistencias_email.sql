begin;

create table public.scanner_relatorios_email (
 id uuid primary key default gen_random_uuid(),
 chave text not null unique check(length(chave) between 1 and 200),
 lote_token uuid references public.scanner_lotes(token),
 configuracao_id uuid not null references public.scanner_configuracoes(id),
 carteira_origem_id uuid not null references public.carteiras(id),
 carteira_envio_id uuid not null references public.carteiras(id),
 operador_id uuid references public.profiles(id),
 destinatario text not null,
 copia text not null default 'edi.neves@gekali.com.br' check(copia='edi.neves@gekali.com.br'),
 mensagem_id uuid not null unique references public.mensagens(id),
 assunto text not null, texto text not null,
 itens jsonb not null check(jsonb_typeof(itens)='array' and jsonb_array_length(itens)<=100),
 resumo jsonb not null default '{}',
 estado text not null default 'pendente' check(estado in ('pendente','enviado','incerto','erro')),
 criado_em timestamptz not null default now(), enviado_em timestamptz, erro text,
 tentativas int not null default 0 check(tentativas between 0 and 3),proxima_tentativa timestamptz not null default now(),
 unique(lote_token,operador_id)
);
create index scanner_relatorios_email_fila on public.scanner_relatorios_email(criado_em) where estado='pendente';
create index scanner_relatorios_email_config on public.scanner_relatorios_email(configuracao_id);
alter table public.scanner_relatorios_email enable row level security;
revoke all on public.scanner_relatorios_email from public,anon,authenticated;
grant select on public.scanner_relatorios_email to authenticated;
grant select,insert on public.scanner_relatorios_email to service_role;
grant update(estado,enviado_em,erro,tentativas,proxima_tentativa) on public.scanner_relatorios_email to service_role;
create policy scanner_relatorios_email_leitura on public.scanner_relatorios_email for select to authenticated
 using(public.current_user_is_admin() or operador_id=(select auth.uid()));

-- A tag no payload não autoriza envio. Exige o relatório registrado pelo executor,
-- o texto e destinatários exatos e a conta específica autorizada pelo usuário.
create function public.scanner_relatorio_email_autorizado(m public.mensagens) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce(m.canal='email' and m.contexto='mensageria' and m.aprovado_em is not null
  and m.cobranca_flow_id is null and m.acordo_flow_id is null and m.pre_juridico_flow_id is null
  and m.cobranca_id is null and m.acordo_id is null
  and m.payload->'email_cc'=jsonb_build_array('edi.neves@gekali.com.br')
  and exists(select 1 from public.scanner_relatorios_email r
   where r.mensagem_id=m.id and r.id::text=m.payload->>'scanner_relatorio_id'
    and r.carteira_envio_id=m.carteira_id and r.destinatario=m.destinatario
    and r.assunto=m.email_assunto and r.texto=m.conteudo and r.texto=m.conteudo_renderizado
    and exists(select 1 from public.integracoes_smtp_config s where s.carteira_id=r.carteira_envio_id
     and s.ativo and lower(trim(s.usuario))='cobranca@gekali.com.br')),false)
$$;
revoke all on function public.scanner_relatorio_email_autorizado(public.mensagens) from public,anon,authenticated;
grant execute on function public.scanner_relatorio_email_autorizado(public.mensagens) to service_role;

-- Preserva integralmente as regras vigentes de Keila/Lídia e acrescenta apenas
-- relatórios selados. Mantém a reserva atômica e a cota existente por conta.
do $$declare anterior text;begin
 select prosrc into strict anterior from pg_proc where oid='public.email_aviso_interno_autorizado(public.mensagens)'::regprocedure;
 if (select lanname from pg_language where oid=(select prolang from pg_proc where oid='public.email_aviso_interno_autorizado(public.mensagens)'::regprocedure))<>'sql' then raise exception 'Regra interna inesperada; revisar migração.';end if;
 execute format('create or replace function public.email_aviso_interno_autorizado(m public.mensagens) returns boolean language sql stable security invoker set search_path='''' as %L',
  'select public.scanner_relatorio_email_autorizado(m) or ('||regexp_replace(trim(anterior),';[[:space:]]*$','')||')');
end $$;

create function public.scanner_registrar_relatorio_email(p_chave text,p_configuracao uuid,p_lote uuid,p_operador uuid,p_assunto text,p_texto text,p_itens jsonb,p_resumo jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare s public.scanner_configuracoes;c public.condominios;r public.scanner_relatorios_email;
 v_operador uuid; v_destino text; v_envio uuid; v_conta text; v_mensagem uuid:=gen_random_uuid();v_id uuid:=gen_random_uuid();j jsonb;
begin
 if p_chave is null or length(p_chave)>200 or length(p_chave)<1 or length(p_texto)>100000 or length(p_assunto)>180 or nullif(trim(p_texto),'') is null or nullif(trim(p_assunto),'') is null
  or jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens)>100 then raise exception 'Relatório inválido ou acima do limite.';end if;
 perform pg_advisory_xact_lock(hashtextextended('scanner-relatorio:'||p_chave,728));
 select * into r from public.scanner_relatorios_email where chave=p_chave;
 if found then return r.id;end if;
 select * into strict s from public.scanner_configuracoes where id=p_configuracao;
 select * into strict c from public.condominios where id=s.condominio_id and status='ativo';
 if p_lote is not null and not exists(select 1 from public.scanner_lotes where token=p_lote and configuracao_id=s.id and concluido_em is not null) then raise exception 'Execução não concluída ou fora do condomínio.';end if;
 v_operador:=p_operador;
 if v_operador is null then select coalesce(c.operador_id,k.operador_id) into v_operador from public.carteiras k where k.id=c.carteira_id;end if;
 select lower(trim(email)) into v_destino from public.profiles where id=v_operador;
 if v_destino is null then v_destino:='edi.neves@gekali.com.br';end if;
 if v_destino !~ '^[^[:space:]@<>;,]+@[^[:space:]@<>;,]+[.][^[:space:]@<>;,]+$' then raise exception 'Responsável sem e-mail válido; relatório preservado para revisão.';end if;
 -- Itens com acordo/cobrança nunca atravessam condomínio, carteira ou responsável.
 for j in select value from jsonb_array_elements(p_itens) loop
  if nullif(j->>'acordo_id','') is not null and not exists(
   select 1 from public.acordos a join public.carteiras k on k.id=a.carteira_id
    where a.id=(j->>'acordo_id')::uuid and a.condominio_id=c.id and a.carteira_id=c.carteira_id
     and coalesce(a.operador_id,c.operador_id,k.operador_id) is not distinct from v_operador
     and a.tipo<>'judicial') then raise exception 'Acordo fora do escopo do relatório extrajudicial.';end if;
  if nullif(j->>'cobranca_id','') is not null and not exists(
   select 1 from public.cobrancas a join public.carteiras k on k.id=a.carteira_id
    where a.id=(j->>'cobranca_id')::uuid and a.condominio_id=c.id and a.carteira_id=c.carteira_id
     and coalesce(a.operador_id,c.operador_id,k.operador_id) is not distinct from v_operador) then raise exception 'Cobrança fora do escopo do relatório.';end if;
 end loop;
 select carteira_id,lower(trim(usuario)) into strict v_envio,v_conta from public.integracoes_smtp_config
  where ativo and lower(trim(usuario))='cobranca@gekali.com.br';
 if v_envio is null then raise exception 'Conta de relatório sem carteira de envio.';end if;
 insert into public.mensagens(id,carteira_id,contexto,canal,destinatario,email_destinatario,email_assunto,conteudo,conteudo_renderizado,status,status_operacional,aprovado_em,payload,origem_evento)
 values(v_mensagem,v_envio,'mensageria','email',v_destino,v_destino,p_assunto,p_texto,p_texto,'aprovada','aprovada',now(),
  jsonb_build_object('scanner_relatorio_id',v_id,'email_cc',jsonb_build_array('edi.neves@gekali.com.br'),'aviso_formalizacao',jsonb_build_object('regra','scanner_inconsistencias_v1')),'scanner.relatorio_inconsistencias');
 insert into public.scanner_relatorios_email(id,chave,lote_token,configuracao_id,carteira_origem_id,carteira_envio_id,operador_id,destinatario,mensagem_id,assunto,texto,itens,resumo)
 values(v_id,p_chave,p_lote,s.id,c.carteira_id,v_envio,v_operador,v_destino,v_mensagem,p_assunto,p_texto,p_itens,coalesce(p_resumo,'{}'));
 perform public.email_reservar_horario(v_mensagem,v_conta);
 return v_id;
end $$;
revoke all on function public.scanner_registrar_relatorio_email(text,uuid,uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.scanner_registrar_relatorio_email(text,uuid,uuid,uuid,text,text,jsonb,jsonb) to service_role;

create function public.scanner_relatorios_lotes_pendentes(p_desde timestamptz,p_limite int default 10) returns setof public.scanner_lotes
language sql stable security invoker set search_path='' as $$
 select l.* from public.scanner_lotes l where l.concluido_em>=p_desde
 and not exists(select 1 from public.scanner_relatorios_email r where r.lote_token=l.token)
 order by l.concluido_em limit greatest(1,least(p_limite,10))
$$;
create function public.scanner_registrar_relatorios_lote(p_lote uuid,p_grupos jsonb) returns uuid[]
language plpgsql security invoker set search_path='' as $$
declare l public.scanner_lotes;g jsonb;ids uuid[]:='{}';begin
 select * into strict l from public.scanner_lotes where token=p_lote;
 if jsonb_typeof(p_grupos) is distinct from 'array' or jsonb_array_length(p_grupos) not between 1 and 20 then raise exception 'Grupos de relatório inválidos.';end if;
 -- Todos os responsáveis do lote são preparados em uma única transação.
 for g in select value from jsonb_array_elements(p_grupos) loop
 ids:=array_append(ids,public.scanner_registrar_relatorio_email('lote:'||p_lote::text||':'||coalesce(g->>'operador_id','sem-operador'),l.configuracao_id,p_lote,
 (g->>'operador_id')::uuid,g->>'assunto',g->>'texto',g->'itens',g->'resumo'));
 end loop;return ids;
end $$;
revoke all on function public.scanner_relatorios_lotes_pendentes(timestamptz,int),public.scanner_registrar_relatorios_lote(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.scanner_relatorios_lotes_pendentes(timestamptz,int),public.scanner_registrar_relatorios_lote(uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
