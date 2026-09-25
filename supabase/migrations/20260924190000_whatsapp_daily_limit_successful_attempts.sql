begin;

-- Failed validation/preparation never transmitted anything. Keep uncertain
-- attempts and partial receipts in the quota, including after manual review.
do $$
declare
  definition text;
  old_clause text := 'where numero=p_numero and (iniciado_em at time zone ''America/Sao_Paulo'')::date=(now() at time zone ''America/Sao_Paulo'')::date) >= 50';
  new_clause text := 'where numero=p_numero and (estado in (''reservado'',''enviado'',''incerto'') or jsonb_array_length(recibos)>0) and (iniciado_em at time zone ''America/Sao_Paulo'')::date=(now() at time zone ''America/Sao_Paulo'')::date) >= 50';
begin
  definition := pg_get_functiondef('public.whatsapp_web_reservar(text,text)'::regprocedure);
  if position(new_clause in definition)>0 then return; end if;
  if position(old_clause in definition)=0 then
    raise exception 'Regra de limite diário inesperada; revise antes de aplicar';
  end if;
  execute replace(definition, old_clause, new_clause);
end $$;

commit;
