begin;
alter table public.easy_pague_consultas add column finalizado_em timestamptz;
create function public.easy_pague_marcar_conclusao() returns trigger language plpgsql set search_path='' as $$
begin
  if new.estado in ('concluido','falha') and new.estado is distinct from old.estado then new.finalizado_em:=now();
  elsif new.estado in ('fila','consultando') then new.finalizado_em:=null; end if;
  return new;
end $$;
create trigger easy_pague_conclusao before update on public.easy_pague_consultas for each row execute function public.easy_pague_marcar_conclusao();
revoke all on function public.easy_pague_marcar_conclusao() from public,anon,authenticated;

create function public.easy_workers_saude(p_operador uuid,p_dominio text,p_administradora text default null,p_limiar integer default 360)
returns jsonb language plpgsql security invoker set search_path='' set statement_timeout='5s' as $$
declare scope uuid[]; papel text; resultado jsonb;
begin
  select role into papel from public.profiles where id=p_operador;
  if papel is null or papel not in ('admin','gestor','operador','financeiro','consulta','leitura') or p_limiar is null or p_limiar not between 30 and 3600 or p_dominio is null or p_dominio not in ('maestro','pague') then raise exception 'Consulta de saúde indisponível.' using errcode='42501'; end if;
  if papel<>'admin' then select coalesce(array_agg(carteira_id),'{}') into scope from public.usuarios_carteiras where user_id=p_operador; end if;
  if p_dominio='maestro' then
    select coalesce(jsonb_agg(jsonb_build_object('origem',r.condominio_nome,'worker',a.script_key,'ultimoSinal',w.ultimo_sinal_em,
      'fila',q.fila,'maisAntigo',q.mais_antigo,'execucaoMaisAntiga',q.execucao_antiga,'tentativas',q.tentativas,'ultimoSucesso',q.sucesso,'ultimaFalha',q.falha) order by r.condominio_nome),'[]') into resultado
    from public.easy_maestro_receitas(scope,p_administradora) r join public.agente_receitas a on a.id=r.receita_id
    left join public.agente_workers w on w.script_key=a.script_key
    cross join lateral(select count(*) filter(where e.status='pendente' and (e.agendado_para is null or e.agendado_para<=now())) as fila,
      min(greatest(e.created_at,coalesce(e.agendado_para,e.created_at))) filter(where e.status='pendente' and (e.agendado_para is null or e.agendado_para<=now())) as mais_antigo,
      min(coalesce(nullif(to_jsonb(e)->>'iniciado_em','')::timestamptz,e.created_at)) filter(where e.status='em_execucao') as execucao_antiga,
      coalesce(max(e.tentativas) filter(where e.status in ('pendente','em_execucao')),0) as tentativas,
      max(e.finalizado_em) filter(where e.status='sucesso') as sucesso,max(e.finalizado_em) filter(where e.status in ('falha','precisa_intervencao')) as falha
      from public.agente_execucoes e where e.receita_id=r.receita_id and e.carteira_id=r.carteira_id) q;
  else
    select jsonb_build_array(jsonb_build_object('origem','Consultas Easy Pag','worker','easy_pague','ultimoSinal',(select ultimo_sinal_em from public.agente_workers where script_key='easy_pague'),
      'fila',count(*) filter(where q.estado='fila'),'maisAntigo',min(q.criado_em) filter(where q.estado='fila'),
      'execucaoMaisAntiga',min(q.criado_em) filter(where q.estado='consultando'),'tentativas',coalesce(max(q.tentativas) filter(where q.estado in ('fila','consultando')),0),
      'ultimoSucesso',max(q.finalizado_em) filter(where q.estado='concluido'),'ultimaFalha',max(q.finalizado_em) filter(where q.estado='falha'))) into resultado
    from public.easy_pague_consultas q join public.scanner_configuracoes s on s.id=q.configuracao_id join public.condominios c on c.id=s.condominio_id
    where c.carteira_id=q.carteira_id and (scope is null or q.carteira_id=any(scope)) and (p_administradora is null or lower(trim(c.administradora))=p_administradora);
  end if;
  return jsonb_build_object('consultadoEm',now(),'limiarSegundos',p_limiar,'origemLimiar','configuração do aplicativo (EASY_WORKER_HEARTBEAT_MAX_SECONDS)','workers',resultado);
end $$;
revoke all on function public.easy_workers_saude(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.easy_workers_saude(uuid,text,text,integer) to service_role;
notify pgrst,'reload schema';
commit;
