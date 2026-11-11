begin;
do $migration$
declare src text; anchor text;
begin
 src:=pg_get_functiondef('public.agente_virtual_formalizacao_humana()'::regprocedure);
 anchor:=$old$case when new.carteira_id='e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'::uuid then md5$old$;
 if position(anchor in src)=0 then raise exception 'Âncora do vínculo de aviso ausente.'; end if;
 execute replace(src,anchor,$new$case when (new.carteira_id='e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'::uuid and new.tipo='keila_atendimento') or (new.carteira_id='06827218-e2b1-4267-ad8f-81a0ab222cad'::uuid and new.tipo='lidia_atendimento') then md5$new$);

 src:=pg_get_functiondef('public.agente_virtual_avisar_operador()'::regprocedure);
 anchor:='parcelas text;';
 if position(anchor in src)=0 then raise exception 'Âncora das variáveis do aviso ausente.'; end if;
 src:=replace(src,anchor,'parcelas text; destino text; operadora text; marca text; dominio text; regra text;');
 anchor:=$old$if new.carteira_id is distinct from 'e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'::uuid or new.tipo not in ('keila_atendimento','lidia_atendimento') or new.payload->>'estado' is distinct from 'atendimento_humano' then return new; end if;$old$;
 if position(anchor in src)=0 then raise exception 'Âncora do escopo do aviso ausente.'; end if;
 src:=replace(src,anchor,$new$if new.tipo='keila_atendimento' and new.carteira_id='e1f6e3ac-1098-4b30-9e0f-af4c47b351a3'::uuid then
  destino:='danielle.lima@gekali.com.br'; operadora:='Danielle'; marca:='GEKALI'; dominio:='gekali.com.br'; regra:='operador_gekali_v1';
 elsif new.tipo='lidia_atendimento' and new.carteira_id='06827218-e2b1-4267-ad8f-81a0ab222cad'::uuid then
  destino:='acordos.camila@genskeadvogados.com.br'; operadora:='Camila'; marca:='Genske Advogados'; dominio:='genskeadvogados.com.br'; regra:='operador_lidia_v1';
 else return new; end if;
 if new.payload->>'estado' is distinct from 'atendimento_humano' then return new; end if;$new$);
 anchor:=$old$corpo:='Danielle,'$old$;
 if position(anchor in src)=0 then raise exception 'Âncora da saudação ausente.'; end if;
 src:=replace(src,anchor,$new$corpo:=operadora||','$new$);
 anchor:=$old$||E'\n\nGKLI Cobrança | GEKALI';$old$;
 if position(anchor in src)=0 then raise exception 'Âncora da assinatura ausente.'; end if;
 src:=replace(src,anchor,$new$||E'\n\nGKLI Cobrança | '||marca;$new$);
 anchor:=$old$'aprovada','aprovada','danielle.lima@gekali.com.br',$old$;
 if position(anchor in src)=0 then raise exception 'Âncora do destinatário ausente.'; end if;
 src:=replace(src,anchor,$new$'aprovada','aprovada',destino,$new$);
 src:=replace(src,$old$'regra','operador_gekali_v1'$old$,$new$'regra',regra$new$);
 src:=replace(src,$old$email_reservar_horario(inserida,'gekali.com.br')$old$,$new$email_reservar_horario(inserida,dominio)$new$);
 execute src;
end $migration$;
notify pgrst,'reload schema';
commit;
