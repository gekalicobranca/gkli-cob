create function public.impedir_importacao_cessao_villa_lobos() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(new.observacoes,'') ~* '(cess[aã]o|loca[cç][aã]o)[^\n]{0,25}espa[cç]o'
    and exists (select 1 from public.condominios d where d.id=new.condominio_id and upper(trim(d.nome))='CONDOMINIO VILLA LOBOS OFFICE PARK') then
    raise exception using errcode='23514', message='Cobrança de cessão ou locação de espaço do Villa Lobos excluída da importação.';
  end if;
  return new;
end $$;
create trigger a_impedir_importacao_cessao_villa_lobos
before insert on public.cobrancas
for each row execute function public.impedir_importacao_cessao_villa_lobos();
