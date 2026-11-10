create or replace function public.bloquear_acordo_para_unidade_judicial()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.unidade_id is not null and exists (
    select 1 from public.unidades u where u.id = new.unidade_id and u.acao_judicial
  ) and not (
    new.tipo = 'judicial'
    and coalesce(new.numero_processo, '') ~ '^[0-9]{7}-[0-9]{2}\.[0-9]{4}\.[0-9]\.[0-9]{2}\.[0-9]{4}$'
  ) then
    raise exception using errcode = 'P0001',
      message = 'Unidade com ação judicial: somente acordo judicial com CNJ válido é permitido.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_bloquear_acordo_para_unidade_judicial on public.acordos;
create trigger trg_bloquear_acordo_para_unidade_judicial
before insert or update of unidade_id, tipo, numero_processo on public.acordos
for each row execute function public.bloquear_acordo_para_unidade_judicial();
