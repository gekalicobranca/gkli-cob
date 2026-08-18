create or replace function public.sincronizar_judicializacao_pre_juridico()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.etapa = 'judicializado'
     and old.etapa is distinct from new.etapa
     and new.unidade_id is not null then
    update public.unidades
       set acao_judicial = true
     where id = new.unidade_id;
  end if;
  return new;
end;
$$;

create trigger trg_sincronizar_judicializacao_pre_juridico
after update of etapa on public.pre_juridico_casos
for each row execute function public.sincronizar_judicializacao_pre_juridico();
