-- Inclui o caso operacional do Dot na mesma transação do recebimento.
do $$
declare definicao text; anterior text;
begin
 select pg_get_functiondef('public.safira_baixar_lello(uuid,uuid,text,text,integer,date,bigint,date,text,text,timestamptz)'::regprocedure) into definicao;
 anterior := $old$and tipo='keila_atendimento' and status not in ('resolvida','cancelada')$old$;
 if position(anterior in definicao)=0 then raise exception 'Cláusula de atendimento não encontrada.'; end if;
 definicao := replace(definicao,anterior,$new$and tipo='keila_atendimento' and status not in ('resolvida','cancelada') and coalesce(payload->>'estado','') not in ('atendimento_humano','concluido')$new$);
 anterior := $old$or exists(select 1 from jsonb_array_elements(coalesce(payload->'acordos','[]'::jsonb)) x where x->>'id'=a.id::text)) order by id$old$;
 if position(anterior in definicao)=0 then raise exception 'Cláusula de vínculo do caso não encontrada.'; end if;
 definicao := replace(definicao,anterior,$new$or payload ? 'conferencias_pagamentos' or exists(select 1 from jsonb_array_elements(coalesce(payload->'acordos','[]'::jsonb)) x where x->>'id'=a.id::text)) order by id$new$);
 execute definicao;
end $$;
notify pgrst,'reload schema';
