-- Ticks simultâneos devem aguardar a decisão do outro: perder a trava
-- antes de o outro ceder a vez deixava ambas as filas sem processamento.
begin;
do $$
declare nome text; definicao text;
begin
  foreach nome in array array['maestro_flow_tick', 'flow_progressao_tick'] loop
    select pg_get_functiondef(to_regprocedure('public.' || nome || '()')) into definicao;
    if position('if not pg_try_advisory_xact_lock(10012026,1) then return null; end if;' in definicao) = 0 then
      raise exception 'Definição inesperada para %; confira antes de aplicar', nome;
    end if;
    execute replace(definicao,
      'if not pg_try_advisory_xact_lock(10012026,1) then return null; end if;',
      'perform pg_advisory_xact_lock(10012026,1);');
    execute format('alter function public.%I() set lock_timeout = %L', nome, '5s');
  end loop;
end $$;
commit;

