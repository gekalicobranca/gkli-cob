-- Recibos BUSS com conta 39 e historico LOCAÇÃO tambem sao locacao de espaco,
-- embora o historico nao traga a palavra ESPAÇO.
create or replace function public.impedir_importacao_cessao_villa_lobos() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.condominios d
    where d.id=new.condominio_id
      and upper(trim(d.nome))='CONDOMINIO VILLA LOBOS OFFICE PARK'
  ) and (
    coalesce(new.observacoes,'') ~* '(cess[aã]o|loca[cç][aã]o)[^\n]{0,25}espa[cç]o'
    or (
      coalesce(new.observacoes,'') ~* 'composi[cç][aã]o da origem: 39 loca[cç][aã]o'
      and exists (
        select 1 from public.unidades u
        where u.id=new.unidade_id and upper(trim(u.bloco))='BUSS'
      )
    )
  ) then
    raise exception using errcode='23514', message='Cobrança de cessão ou locação de espaço do Villa Lobos excluída da importação.';
  end if;
  return new;
end $$;
