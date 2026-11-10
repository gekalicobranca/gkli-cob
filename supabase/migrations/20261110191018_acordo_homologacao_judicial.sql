begin;

create or replace function public.acordo_registrar_homologacao_adm(
  p_acordo uuid, p_revisao text, p_referencia text, p_nome_pdf text, p_pdf_base64 text,
  p_conferido boolean, p_divergencia text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.acordos%rowtype;
  v_cadastro jsonb;
  v_pdf bytea;
begin
  select * into a from public.acordos where id = p_acordo for update;
  if not found or auth.uid() is null or public.current_user_can_access_carteira(a.carteira_id) is not true
    or not exists(select 1 from public.profiles where id = auth.uid() and role in ('admin','gestor','operador')) then
    raise exception 'Sem permissão para homologar o acordo.';
  end if;
  if (a.tipo is null or a.tipo not in ('extrajudicial', 'judicial')) or a.status in ('cancelado','quebrado','rompido','renegociado')
    or (a.exige_aprovacao_sindico and a.sindico_aprovado_em is null) then
    raise exception 'O acordo está encerrado ou tem aprovação pendente.';
  end if;
  v_cadastro := public.acordo_cadastro_para_homologacao(a);
  if public.acordo_revisao_adm(a) is distinct from p_revisao then
    raise exception 'O cadastro mudou durante a conferência. Recarregue a página e confira novamente.';
  end if;
  if jsonb_array_length(v_cadastro->'parcelas') = 0 then
    raise exception 'Cadastre as parcelas antes de homologar.';
  end if;
  if p_conferido is null or (not p_conferido and coalesce(length(btrim(p_divergencia)),0) < 10)
    or length(p_divergencia) > 2000 then
    raise exception 'Descreva a divergência encontrada.';
  end if;
  if p_conferido and nullif(btrim(p_divergencia),'') is not null then
    raise exception 'Registre a divergência antes de homologar o acordo.';
  end if;
  if p_pdf_base64 is null or length(p_pdf_base64) > 4194304 then
    raise exception 'Anexe o PDF da administradora com até 3 MB.';
  end if;
  v_pdf := decode(p_pdf_base64, 'base64');
  if substring(v_pdf from 1 for 5) <> decode('255044462d','hex') then
    raise exception 'O documento anexado precisa ser um PDF.';
  end if;
  insert into public.acordo_homologacoes_adm (
    acordo_id, carteira_id, operador_id, operador_nome, referencia, nome_pdf, documento, cadastro, conferido, divergencia
  ) values (
    a.id, a.carteira_id, auth.uid(), (select nome from public.profiles where id = auth.uid()),
    btrim(p_referencia), btrim(p_nome_pdf), v_pdf, v_cadastro,
    p_conferido, case when not p_conferido then btrim(p_divergencia) end
  );
end
$$;

notify pgrst, 'reload schema';
commit;

