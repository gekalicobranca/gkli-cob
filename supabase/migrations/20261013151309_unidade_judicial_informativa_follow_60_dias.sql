begin;
-- A ação judicial na unidade é informativa. Não altera cobranças existentes ou futuras.
drop trigger if exists trg_aplicar_acao_judicial_em_cobranca on public.cobrancas;
drop trigger if exists trg_propagar_acao_judicial_da_unidade on public.unidades;
comment on column public.unidades.acao_judicial is
  'Informativo: a unidade possui ação judicial. Elegibilidade e bloqueios são definidos em cada cobrança.';

create or replace function public.bloquear_acordo_para_unidade_judicial()
returns trigger language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.cobrancas c where c.id = new.cobranca_id
    and (c.status = 'judicializado' or c.status_operacional = 'judicializado'))
    and not (new.tipo = 'judicial' and coalesce(new.numero_processo, '') ~ '^[0-9]{7}-[0-9]{2}\.[0-9]{4}\.[0-9]\.[0-9]{2}\.[0-9]{4}$') then
    raise exception 'Cobrança judicializada: somente acordo judicial com CNJ válido é permitido.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_bloquear_acordo_para_unidade_judicial on public.acordos;
create trigger trg_bloquear_acordo_para_unidade_judicial
before insert or update of cobranca_id, unidade_id, tipo, numero_processo on public.acordos
for each row execute function public.bloquear_acordo_para_unidade_judicial();

-- A distribuição não judicializa débitos novos e alheios ao pré-jurídico.
create or replace function public.sincronizar_judicializacao_pre_juridico()
returns trigger language plpgsql set search_path = '' as $$
begin
  if ((new.distribuicao_status = 'distribuido' and old.distribuicao_status is distinct from new.distribuicao_status)
      or (new.etapa = 'judicializado' and old.etapa is distinct from new.etapa))
     and new.unidade_id is not null then
    update public.unidades set acao_judicial = true where id = new.unidade_id;
    update public.cobrancas set status = 'judicializado', status_operacional = 'judicializado'
    where unidade_id = new.unidade_id and duplicada_de_id is null
      and (id = new.cobranca_id or coalesce(status_operacional, status) in ('pre_distribuicao','pre_juridico'))
      and lower(coalesce(status_financeiro, '')) not in ('quitado','pago','cancelado');
  end if;
  return new;
end;
$$;

-- Preserva autorização, reservas e proteções existentes; retira apenas o bloqueio por unidade.
do $$ declare src text; anchor text; begin
  src := pg_get_functiondef('public.flow_cobranca_mensagem_elegivel(public.mensagens)'::regprocedure);
  anchor := ' or u.acao_judicial';
  if position(anchor in src) = 0 then raise exception 'Âncora de elegibilidade judicial não encontrada'; end if;
  execute replace(src, anchor, '');

  src := pg_get_functiondef('public.flow_cancelar_apos_status_cobranca()'::regprocedure);
  anchor := 'or (new.unidade_id is not null and c.unidade_id=new.unidade_id and c.condominio_id=new.condominio_id)';
  if position(anchor in src) = 0 then raise exception 'Âncora de cancelamento por unidade não encontrada'; end if;
  execute replace(src, anchor, '');

  src := pg_get_functiondef('public.agente_virtual_negociar_acordo(text,uuid,uuid,text,jsonb,text)'::regprocedure);
  anchor := 'if not found or un.acao_judicial then';
  if position(anchor in src) = 0 then raise exception 'Âncora do agente virtual não encontrada'; end if;
  execute replace(replace(src, anchor, 'if not found then'), 'Unidade inválida ou judicializada.', 'Unidade inválida.');
end $$;

-- Somente o Follow: ambos os campos devem expressar a régua de 60 dias.
update public.condominios set inicio_cobranca_dias = 60, dias_apos_vencimento_regua = 60
where id = '13290a44-ec8d-4232-81e7-711196547f91';
commit;
