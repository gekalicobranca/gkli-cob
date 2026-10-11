-- Troca o piloto da Lidia mantendo as demais regras financeiras e de autorização.
do $$
declare
  piloto public.condominios%rowtype;
  func record;
  definicao text;
begin
  select c.* into strict piloto
  from public.condominios c join public.carteiras ca on ca.id=c.carteira_id
  where c.nome='CONDOMÍNIO EDIFÍCIO OASIS' and ca.nome='Genske Advogados';
  for func in select oid from pg_proc where pronamespace='public'::regnamespace
    and proname in ('agente_virtual_negociar_acordo','agente_virtual_efetivar_acordo')
  loop
    definicao := pg_get_functiondef(func.oid);
    if position('9cf7f942-46b7-42ac-b766-b3a9edc78895' in definicao)=0 then
      raise exception 'Restrição do piloto anterior não encontrada.';
    end if;
    definicao := replace(definicao,'9cf7f942-46b7-42ac-b766-b3a9edc78895',piloto.id::text);
    definicao := replace(definicao,'36b6c087-56d2-4297-be63-6dcbe02a9f00',piloto.carteira_id::text);
    execute definicao;
  end loop;
  update public.condominios set operacao_virtual_habilitada=true,updated_at=now() where id=piloto.id;
end $$;
