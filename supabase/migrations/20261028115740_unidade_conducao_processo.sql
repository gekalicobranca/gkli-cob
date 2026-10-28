alter table public.unidades
  add column conducao_processo text not null default 'nao_informado'
    check (conducao_processo in ('nao_informado','nosso_escritorio','outro_advogado')),
  add column advogado_externo_nome text check (length(advogado_externo_nome) <= 200),
  add column advogado_externo_contato text check (length(advogado_externo_contato) <= 300);

comment on column public.unidades.conducao_processo is 'Condução do processo judicial; não presume nome do advogado, CNJ ou período judicializado.';

create function public.preservar_judicial_conducao_processo()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.conducao_processo in ('nosso_escritorio','outro_advogado') then
    new.acao_judicial := true;
  end if;
  return new;
end;
$$;

create trigger preservar_judicial_conducao_processo
before insert or update of conducao_processo, acao_judicial on public.unidades
for each row execute function public.preservar_judicial_conducao_processo();

create index unidades_conducao_processo_carteira_idx
on public.unidades(carteira_id, conducao_processo) where conducao_processo <> 'nao_informado';
