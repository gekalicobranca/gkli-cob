-- The financial RPC remains the single authority for scope, locks and duplicates.
-- Contact and agreement commit together; failures roll back both.
create or replace function public.criar_acordo_com_contato(p_financeiro jsonb, p_contato jsonb default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_acordo uuid;
  v_data date;
  v_canal text;
  v_resumo text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role in ('admin','gestor','operador')
  ) then raise exception 'Sem permissão para criar acordo.'; end if;

  if p_contato is not null and p_contato <> 'null'::jsonb then
    if jsonb_typeof(p_contato) <> 'object' then raise exception 'Contato inválido.'; end if;
    v_canal := p_contato->>'canal';
    v_resumo := btrim(p_contato->>'resumo');
    if v_canal is null or v_canal not in ('whatsapp','email','telefone','presencial','outro')
      or v_resumo is null or length(v_resumo) not between 2 and 2000
      or coalesce(p_contato->>'data','') !~ '^\d{4}-\d{2}-\d{2}$'
    then raise exception 'Informe canal, data e resumo válidos para o contato.'; end if;
    v_data := (p_contato->>'data')::date;
    if v_data > (now() at time zone 'America/Sao_Paulo')::date then
      raise exception 'A data do contato não pode estar no futuro.';
    end if;
  end if;

  v_acordo := public.criar_acordo_financeiro(
    (p_financeiro->>'p_carteira_id')::uuid,
    (p_financeiro->>'p_cobranca_id')::uuid,
    (p_financeiro->>'p_condominio_id')::uuid,
    (p_financeiro->>'p_unidade_id')::uuid,
    p_financeiro->>'p_tipo', p_financeiro->>'p_numero_processo',
    (p_financeiro->>'p_valor_acordado')::numeric,
    (p_financeiro->>'p_entrada')::numeric,
    (p_financeiro->>'p_despesa_cobranca_percentual')::numeric,
    (p_financeiro->>'p_despesa_cobranca_valor')::numeric,
    (p_financeiro->>'p_data_acordo')::date,
    p_financeiro->>'p_status', p_financeiro->>'p_fluxo_status',
    (p_financeiro->>'p_exige_aprovacao_sindico')::boolean,
    p_financeiro->>'p_documento_url', p_financeiro->>'p_observacoes',
    p_financeiro->'p_itens', p_financeiro->'p_parcelas', p_financeiro->>'p_cobranca_status'
  );

  if v_data is not null then
    insert into public.interacoes(carteira_id, cobranca_id, acordo_id, user_id, tipo, conteudo)
    values ((p_financeiro->>'p_carteira_id')::uuid,
      (p_financeiro->>'p_cobranca_id')::uuid, v_acordo, auth.uid(), v_canal,
      'Contato da negociação em ' || to_char(v_data,'DD/MM/YYYY') || E'\n' || v_resumo);
    update public.cobrancas set ultima_interacao_at = now()
      where id = (p_financeiro->>'p_cobranca_id')::uuid;
  end if;
  return v_acordo;
end;
$$;
revoke all on function public.criar_acordo_com_contato(jsonb,jsonb) from public, anon;
grant execute on function public.criar_acordo_com_contato(jsonb,jsonb) to authenticated;
comment on function public.criar_acordo_com_contato(jsonb,jsonb) is
  'Cria acordo e contato opcional atomicamente, preservando os bloqueios e locks de criar_acordo_financeiro.';
