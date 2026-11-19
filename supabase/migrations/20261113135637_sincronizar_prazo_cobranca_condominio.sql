create function public.sincronizar_prazo_cobranca_condominio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.dias_apos_vencimento_regua := new.inicio_cobranca_dias;
  return new;
end;
$$;

create trigger sincronizar_prazo_cobranca_condominio
before insert or update of inicio_cobranca_dias, dias_apos_vencimento_regua
on public.condominios
for each row execute function public.sincronizar_prazo_cobranca_condominio();

-- O cadastro é a fonte do prazo. A coluna antiga atende leitores existentes.
update public.condominios
set dias_apos_vencimento_regua = inicio_cobranca_dias
where dias_apos_vencimento_regua is distinct from inicio_cobranca_dias;
