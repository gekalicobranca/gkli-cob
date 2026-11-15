begin;

alter table public.condominios
  add column easy_espelhamento_liberacao text not null default 'revisao'
    check (easy_espelhamento_liberacao in ('revisao', 'cotas', 'completo'));

create function public.easy_espelhamento_proteger_liberacao()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.easy_espelhamento_liberacao = 'revisao' then return new; end if;
  elsif new.easy_espelhamento_liberacao = old.easy_espelhamento_liberacao then
    return new;
  end if;
  if current_user in ('anon', 'authenticated') and not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'gestor')
  ) then
    raise exception using errcode = '42501', message = 'A liberação do Easy Espelhar exige perfil de gestão.';
  end if;
  return new;
end;
$$;

create trigger easy_espelhamento_proteger_liberacao
before insert or update of easy_espelhamento_liberacao on public.condominios
for each row execute function public.easy_espelhamento_proteger_liberacao();

alter table public.easy_espelhamentos
  add column liberacao_solicitada text not null default 'revisao'
    check (liberacao_solicitada in ('revisao', 'cotas', 'completo'));

create function public.easy_espelhamento_validar_solicitacao()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.liberacao_solicitada := 'revisao';
  if new.aplicar then
    select c.easy_espelhamento_liberacao into new.liberacao_solicitada
    from public.condominios c
    where c.id = new.condominio_id and c.carteira_id = new.carteira_id;
    if coalesce(new.liberacao_solicitada, 'revisao') = 'revisao' then
      raise exception 'Condomínio em revisão. Libere o espelhamento no cadastro.';
    end if;
  end if;
  return new;
end;
$$;

create trigger easy_espelhamento_validar_solicitacao
before insert on public.easy_espelhamentos
for each row execute function public.easy_espelhamento_validar_solicitacao();

revoke execute on function public.easy_espelhamento_proteger_liberacao(),
  public.easy_espelhamento_validar_solicitacao() from public, anon, authenticated;

do $$
declare
  painel text := pg_get_functiondef('public.easy_espelhamento_painel_resumo(uuid[])'::regprocedure);
  concluir text := pg_get_functiondef('public.easy_espelhamento_concluir(uuid,integer,text,jsonb)'::regprocedure);
  campo text := '''agendado'',c.easy_espelhamento_agendado';
  inicio text := '  if pedido.aplicar then';
  itens text := '    for item in select value from jsonb_array_elements(p_resultado->''alteracoes'') loop';
begin
  if strpos(painel, campo) = 0 or strpos(concluir, inicio) = 0 or strpos(concluir, itens) = 0 then
    raise exception 'Definição do Easy Espelhar mudou; revise a migração.';
  end if;
  execute replace(painel, campo, campo || ',''liberacao'',c.easy_espelhamento_liberacao');
  concluir := replace(concluir, inicio, inicio || $trecho$
    -- Serializa a aplicação com alterações na liberação do cadastro.
    select * into strict condominio from public.condominios c
      where c.id=pedido.condominio_id and c.carteira_id=pedido.carteira_id and c.status='ativo' for no key update;
    if condominio.easy_espelhamento_liberacao = 'revisao' or pedido.liberacao_solicitada = 'revisao' then
      raise exception 'Condomínio em revisão. Solicite o espelhamento após liberar no cadastro.';
    end if;
$trecho$);
  execute replace(concluir, itens, itens || $trecho$
      if (condominio.easy_espelhamento_liberacao = 'cotas' or pedido.liberacao_solicitada = 'cotas')
        and coalesce(item->>'tipo', '') not in ('cota_aberta', 'cota_paga') then
        recusadas := recusadas || jsonb_build_array(jsonb_build_object(
          'tipo', item->>'tipo', 'unidade', item->>'unidade',
          'referencia', coalesce(item->>'recibo', item->>'numero'),
          'motivo', 'Condomínio liberado só para cotas.'));
        continue;
      end if;
$trecho$);
end;
$$;

commit;
