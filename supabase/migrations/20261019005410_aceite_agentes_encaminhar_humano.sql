begin;
-- Keep the financial creation and all its checks. Add structured acceptance evidence.
do $migration$
declare src text; anchor text;
begin
 src:=pg_get_functiondef('public.agente_virtual_negociar_acordo(text,uuid,uuid,text,jsonb,text)'::regprocedure);
 anchor:='proposta:=proposta||jsonb_build_object(''id'',acordo,''etapa'',etapa,';
 if position(anchor in src)=0 then raise exception 'Âncora do acordo firmado ausente.'; end if;
 src:=replace(src,anchor,anchor||'''aceite_em'',now(),''aceite_evidencia'',trim(p_evidencia),''aceite_usuario_id'',auth.uid(),');
 anchor:='if p_agente=''lidia'' and';
 if position(anchor in src)=0 then raise exception 'Âncora de versão ausente.'; end if;
 src:=replace(src,anchor,E'if p_operacao=''aceitar'' and p_dados ? ''updated_at'' and (p_dados->>''updated_at'')::timestamptz is distinct from caso.updated_at then raise exception ''Atendimento alterado. Recarregue antes de registrar o aceite.''; end if;\n  '||anchor);
 execute src;
end $migration$;

-- Runs in the same transaction as agreement creation: either both persist or neither.
create function public.agente_virtual_formalizacao_humana() returns trigger
language plpgsql security invoker set search_path='' as $$
declare item jsonb; anterior jsonb; itens jsonb:='[]'; pendencias jsonb; tarefa text; em timestamptz:=clock_timestamp(); alterado boolean:=false;
begin
 if new.tipo not in ('keila_atendimento','lidia_atendimento') then return new; end if;
 pendencias:=coalesce(new.payload->'acompanhamento'->'pendencias','[]');
 tarefa:='Formalizar acordo na administradora e obter termo e boletos. O operador deve definir cadastro direto ou solicitação à administradora, conferir documentos e registro bancário e submeter o envio para aprovação.';
 for item in select value from jsonb_array_elements(coalesce(new.payload->'acordos','[]')) loop
  if item->>'etapa'='acordo_firmado'
   and not exists(select 1 from jsonb_array_elements(coalesce(old.payload->'acordos','[]')) a where a->>'id'=item->>'id' and a->>'etapa' in ('acordo_firmado','acordo_efetivado')) then
   if not exists(select 1 from public.acordos a where a.id::text=item->>'id' and a.unidade_id::text=item->>'unidade_id'
     and a.carteira_id=new.carteira_id and a.condominio_id=new.condominio_id and a.devedor_aceito_em is not null and a.status not in ('cancelado','quebrado','renegociado')) then
    raise exception 'Acordo firmado sem vínculo financeiro e aceite confirmado.';
   end if;
   select value into anterior from jsonb_array_elements(coalesce(old.payload->'acordos','[]')) a where a->>'unidade_id'=item->>'unidade_id';
   item:=item||jsonb_build_object('formalizacao',jsonb_build_object('status','pendente','registrada_em',em,
    'evidencia',coalesce(item->>'aceite_evidencia',new.payload->'atividades'->-1->>'descricao'),
    'usuario_id',item->'aceite_usuario_id','proposta_aceita',coalesce(anterior,item),'aprovacao',old.payload->'resposta_aprovada'));
   if not exists(select 1 from jsonb_array_elements(pendencias) p where p->>'id'='formalizar-acordo:'||(item->>'id')) then
    pendencias:=pendencias||jsonb_build_array(jsonb_build_object('id','formalizar-acordo:'||(item->>'id'),'tipo','boletos',
     'aguardando','Operador humano — formalizar na administradora e obter termo e boletos','criada_em',em,
     'prazo',(em at time zone 'America/Sao_Paulo')::date,'intervalo_dias',1,'proxima_acao',tarefa,'acordo_id',item->>'id',
     'evidencia',item->'formalizacao'->>'evidencia','simulacoes','[]'::jsonb));
   end if;
   alterado:=true;
  end if;
  itens:=itens||jsonb_build_array(item);
 end loop;
 if alterado then
  new.payload:=new.payload||jsonb_build_object('acordos',itens,'estado','atendimento_humano','proxima_acao',tarefa,
   'acompanhamento',coalesce(new.payload->'acompanhamento',jsonb_build_object('conversas','[]'::jsonb))||jsonb_build_object('pendencias',pendencias),
   'atividades',coalesce(new.payload->'atividades','[]')||jsonb_build_array(jsonb_build_object('em',em,'usuario_id',null,
    'descricao','Acordo firmado no app após o aceite. Atendimento encaminhado para atuação humana: formalizar na administradora e obter termo e boletos. Nenhum envio realizado.')));
  new.status:='em_tratamento'; new.descricao:=tarefa; new.updated_at:=em;
 end if;
 return new;
end $$;
create trigger agente_virtual_formalizacao_humana before update of payload on public.central_pendencias
for each row when (new.tipo in ('keila_atendimento','lidia_atendimento')) execute function public.agente_virtual_formalizacao_humana();
revoke all on function public.agente_virtual_formalizacao_humana() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
