do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.lote_itens'::regclass
      and conname = 'lote_itens_status_check'
  ) then
    alter table public.lote_itens
      drop constraint lote_itens_status_check;
  end if;

  alter table public.lote_itens
    add constraint lote_itens_status_check
    check (
      status in (
        'criado',
        'pulada',
        'duplicada',
        'erro',
        'aprovado',
        'enviado',
        'pausado',
        'retorno_registrado',
        'cancelado'
      )
    );
end $$;
