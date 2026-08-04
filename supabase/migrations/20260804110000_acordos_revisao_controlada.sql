alter table public.acordos_revisoes drop constraint if exists acordos_revisoes_tipo_check;
alter table public.acordos_revisoes add constraint acordos_revisoes_tipo_check
  check (tipo in ('reemissao_parcela', 'ajuste_manual_parcela'));

create or replace function public.revisar_parcela_acordo(
  p_acordo_id uuid, p_parcela_id uuid, p_valor_novo numeric,
  p_vencimento_novo date, p_motivo text
) returns uuid language plpgsql set search_path = public as $$
declare
  v_acordo public.acordos%rowtype;
  v_parcela public.parcelas_acordo%rowtype;
  v_revisao_id uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and perfil in ('admin', 'gestor')) then
    raise exception 'Apenas administradores e gestores podem revisar acordos.';
  end if;
  if p_valor_novo is null or p_valor_novo <= 0 then raise exception 'O novo valor deve ser maior que zero.'; end if;
  if p_vencimento_novo is null then raise exception 'Informe o novo vencimento.'; end if;
  if char_length(v_motivo) < 10 then raise exception 'Informe uma justificativa com pelo menos 10 caracteres.'; end if;

  select * into v_acordo from public.acordos where id = p_acordo_id for update;
  if not found or not public.current_user_can_access_carteira(v_acordo.carteira_id) then
    raise exception 'Acordo não encontrado ou sem permissão de acesso.';
  end if;
  if lower(coalesce(v_acordo.status, '')) in ('cancelado', 'quitado', 'rompido', 'quebrado') then
    raise exception 'Não é possível revisar um acordo encerrado.';
  end if;

  select * into v_parcela from public.parcelas_acordo
  where id = p_parcela_id and acordo_id = p_acordo_id for update;
  if not found then raise exception 'Parcela não encontrada.'; end if;
  if v_parcela.data_pagamento is not null or lower(coalesce(v_parcela.status, '')) in
    ('paga', 'pago', 'quitada', 'quitado', 'cancelada', 'cancelado') then
    raise exception 'Parcelas pagas ou encerradas não podem ser revisadas.';
  end if;
  if round(v_parcela.valor::numeric, 2) = round(p_valor_novo, 2)
     and v_parcela.vencimento = p_vencimento_novo then
    raise exception 'Altere o valor ou o vencimento para registrar a revisão.';
  end if;

  update public.parcelas_acordo set valor = round(p_valor_novo, 2),
    vencimento = p_vencimento_novo, updated_at = now() where id = v_parcela.id;
  update public.acordos set valor_acordado = greatest(0,
    round((coalesce(valor_acordado, 0) + round(p_valor_novo, 2) - coalesce(v_parcela.valor, 0))::numeric, 2)),
    updated_at = now() where id = v_acordo.id;

  insert into public.acordos_revisoes (
    carteira_id, acordo_id, parcela_id, tipo, status, valor_anterior, valor_novo,
    vencimento_anterior, vencimento_novo, motivo, criado_por, concluido_em
  ) values (
    v_acordo.carteira_id, v_acordo.id, v_parcela.id, 'ajuste_manual_parcela', 'concluida',
    coalesce(v_parcela.valor, 0), round(p_valor_novo, 2), v_parcela.vencimento,
    p_vencimento_novo, v_motivo, auth.uid(), now()
  ) returning id into v_revisao_id;
  return v_revisao_id;
end;
$$;

revoke execute on function public.revisar_parcela_acordo(uuid, uuid, numeric, date, text) from public;
revoke execute on function public.revisar_parcela_acordo(uuid, uuid, numeric, date, text) from anon;
grant execute on function public.revisar_parcela_acordo(uuid, uuid, numeric, date, text) to authenticated;
