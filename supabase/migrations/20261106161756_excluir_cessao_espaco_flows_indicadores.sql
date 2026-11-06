begin;
alter table public.cobrancas add column excluida_por_cessao_espaco boolean not null default false;
create function public.classificar_exclusao_cessao_espaco() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.excluida_por_cessao_espaco := coalesce(new.observacoes,'') ~* '(cess[aã]o|loca[cç][aã]o)[^\n]{0,25}espa[cç]o';
  if new.excluida_por_cessao_espaco then
    new.automacao_bloqueada := true;
  end if;
  return new;
end $$;
create trigger z_classificar_exclusao_cessao_espaco
before insert or update of observacoes, automacao_bloqueada, excluida_por_cessao_espaco on public.cobrancas
for each row execute function public.classificar_exclusao_cessao_espaco();
update public.cobrancas set excluida_por_cessao_espaco=true
where coalesce(observacoes,'') ~* '(cess[aã]o|loca[cç][aã]o)[^\n]{0,25}espa[cç]o' and duplicada_de_id is null;
commit;
