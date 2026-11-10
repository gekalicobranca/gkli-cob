begin;
-- Restrict the authorized internal recipients to GEKALI, never another wallet.
do $migration$
declare src text; anchor text;
begin
 src:=pg_get_functiondef('public.agente_virtual_formalizacao_humana()'::regprocedure);
 anchor:='''usuario_id'',item->''aceite_usuario_id'',''proposta_aceita''';
 if position(anchor in src)=0 then raise exception 'Âncora do encaminhamento humano ausente.'; end if;
 execute replace(src,anchor,'''aviso_operador_mensagem_id'',case when new.carteira_id=''e1f6e3ac-1098-4b30-9e0f-af4c47b351a3''::uuid then md5(''aviso-formalizacao-v1:''||new.id::text||'':''||(item->>''id''))::uuid else null end,'||anchor);
end $migration$;

create function public.agente_virtual_avisar_operador() returns trigger
language plpgsql security invoker set search_path='' as $$
declare item jsonb; mensagem uuid; inserida uuid; condominio text; corpo text; parcelas text;
begin
 if new.carteira_id is distinct from 'e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'::uuid or new.tipo not in ('keila_atendimento','lidia_atendimento') or new.payload->>'estado' is distinct from 'atendimento_humano' then return new; end if;
 for item in select value from jsonb_array_elements(coalesce(new.payload->'acordos','[]')) loop
  if item->>'etapa' is distinct from 'acordo_firmado' or item->'formalizacao'->>'aviso_operador_mensagem_id' is null then continue; end if;
  -- Only the new handoff; later edits, retries and historical agreements do not notify again.
  if exists(select 1 from jsonb_array_elements(coalesce(old.payload->'acordos','[]')) a where a->>'id'=item->>'id' and a->'formalizacao'->>'aviso_operador_mensagem_id' is not null) then continue; end if;
  mensagem:=md5('aviso-formalizacao-v1:'||new.id::text||':'||(item->>'id'))::uuid;
  if mensagem::text is distinct from item->'formalizacao'->>'aviso_operador_mensagem_id' then raise exception 'Vínculo do aviso inválido.'; end if;
  select nome into strict condominio from public.condominios where id=new.condominio_id and carteira_id=new.carteira_id;
  select string_agg((p->>'numero')||'ª parcela: R$ '||replace(to_char((p->>'valor')::numeric,'FM999999999990.00'),'.',',')||' — '||to_char((p->>'vencimento')::date,'DD/MM/YYYY'),E'\n' order by (p->>'numero')::int) into parcelas from jsonb_array_elements(item->'parcelas') p;
  corpo:='Danielle,'||E'\n\nO acordo foi firmado no app após o aceite do condômino e encaminhado para atuação humana.'||E'\n\nCondomínio: '||condominio||E'\nUnidade: '||coalesce(item->>'unidade',item->>'unidade_id')
   ||E'\nAcordo no app: '||(item->>'id')||E'\nTotal aceito: R$ '||replace(to_char((item->>'total')::numeric,'FM999999999990.00'),'.',',')
   ||E'\n\nCondições aceitas:\n'||parcelas||E'\n\nEvidência do aceite:\n'||coalesce(item->'formalizacao'->>'evidencia','Consultar o histórico do atendimento.')
   ||E'\n\nPendência: formalizar na administradora e obter termo e boletos. Definir se o cadastro será feito diretamente ou solicitado à administradora, conferir os documentos e o registro bancário e deixar o envio para aprovação. Acordo firmado no app não representa pagamento confirmado.'
   ||E'\n\nAtendimento: https://gkli-cob.vercel.app/app/gestao/'||case when new.tipo='lidia_atendimento' then 'lidia' else 'keila' end||'?caso='||new.id::text||'#detalhes-caso'
   ||E'\nAcordo: https://gkli-cob.vercel.app/app/acordos/'||(item->>'id')||E'\n\nGKLI Cobrança | GEKALI';
  insert into public.mensagens(id,carteira_id,contexto,canal,status,status_operacional,destinatario,email_assunto,conteudo,conteudo_renderizado,aprovado_em,payload)
   values(mensagem,new.carteira_id,'mensageria','email','aprovada','aprovada','danielle.lima@gekali.com.br','Acordo firmado — formalização na administradora — '||regexp_replace(condominio,E'[\r\n]',' ','g'),corpo,corpo,now(),
    jsonb_build_object('keila_caso_id',new.id,'email_cc',jsonb_build_array('edi.neves@gekali.com.br'),
     'aviso_formalizacao',jsonb_build_object('regra','operador_gekali_v1','acordo_id',item->>'id','autorizacao','envio_automatico_interno_autorizado_pelo_operador')))
   on conflict(id) do nothing returning id into inserida;
  if inserida is not null then
   begin
    perform public.email_reservar_horario(inserida,'gekali.com.br');
   exception when others then
    update public.mensagens set status='falha',status_operacional='falha',erro_envio='Falha ao agendar aviso interno: '||left(sqlerrm,400) where id=inserida;
   end;
  end if;
 end loop;
 return new;
end $$;
create trigger agente_virtual_avisar_operador after update of payload on public.central_pendencias
for each row when (new.tipo in ('keila_atendimento','lidia_atendimento')) execute function public.agente_virtual_avisar_operador();
revoke all on function public.agente_virtual_avisar_operador() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
