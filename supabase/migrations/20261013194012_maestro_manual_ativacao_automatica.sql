begin;
-- Disparos manuais do Maestro seguem a mesma fila automática dos agendados.
-- O controle da carteira e as validações de cobrança/destinatário continuam ativos.
do $$ declare src text; antigo text; novo text; begin
  src := pg_get_functiondef('public.maestro_flow_finalizar(uuid,uuid,text)'::regprocedure);
  antigo := 'case when total>0 then case when exists(select 1 from public.agente_execucoes e where e.id=j.execucao_id and e.origem=''maestro'') then ''pausado'' else ''pronto'' end when falhas>0 then ''concluido_com_falhas'' else ''concluido'' end';
  novo := 'case when total>0 then ''pronto'' when falhas>0 then ''concluido_com_falhas'' else ''concluido'' end';
  if position(antigo in src)>0 then execute replace(src,antigo,novo);
  elsif position(novo in src)=0 then raise exception 'Finalização do Maestro fora da versão esperada'; end if;
end $$;

-- Libera apenas a pausa inicial imposta pela montagem, não pausas do operador.
with liberados as (
  update public.cobranca_flows set status='pronto',updated_at=now()
  where payload->>'origem'='maestro' and status='pausado'
    and pausado_em is null and iniciado_em is null and total_mensagens>0
  returning id,carteira_id
)
insert into public.maestro_flow_ativacoes(flow_id,carteira_id,status)
select f.id,f.carteira_id,'pendente' from liberados f
where exists(select 1 from public.maestro_flow_controle c where c.carteira_id=f.carteira_id and c.ativo)
on conflict(flow_id) do update set status='pendente',erro=null,updated_at=now()
where maestro_flow_ativacoes.status in('manual','atencao');
commit;
