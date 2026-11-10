begin;

create table public.acordo_homologacoes_adm (
  id uuid primary key default gen_random_uuid(),
  acordo_id uuid not null references public.acordos(id) on delete cascade,
  carteira_id uuid not null,
  operador_id uuid not null,
  operador_nome text,
  criado_em timestamptz not null default clock_timestamp(),
  referencia text not null check (length(referencia) between 1 and 150),
  nome_pdf text not null check (length(nome_pdf) between 1 and 180),
  documento bytea not null check (octet_length(documento) between 5 and 3145728),
  cadastro jsonb not null,
  conferido boolean not null,
  divergencia text
);
create index acordo_homologacoes_adm_historico
  on public.acordo_homologacoes_adm (acordo_id, criado_em desc, id desc);

alter table public.acordo_homologacoes_adm enable row level security;
revoke all on public.acordo_homologacoes_adm from public, anon, authenticated;
grant select (id, acordo_id, carteira_id, operador_id, operador_nome, criado_em, referencia, nome_pdf, cadastro, conferido, divergencia)
  on public.acordo_homologacoes_adm to authenticated;
grant select on public.acordo_homologacoes_adm to service_role;
create policy acordo_homologacoes_adm_leitura on public.acordo_homologacoes_adm
  for select to authenticated using (exists (
    select 1 from public.acordos a where a.id = acordo_homologacoes_adm.acordo_id
      and a.carteira_id = acordo_homologacoes_adm.carteira_id
      and public.current_user_can_access_carteira(a.carteira_id)
  ));

create function public.acordo_cadastro_para_homologacao(a public.acordos)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'carteira', a.carteira_id, 'condominio', a.condominio_id, 'unidade', a.unidade_id,
    'data', a.data_acordo, 'total', a.valor_acordado, 'entrada', a.entrada,
    'cobranca', a.cobranca_id,
    'cotas', coalesce((select jsonb_agg(c.cobranca_id order by c.cobranca_id)
      from public.acordo_cobrancas c where c.acordo_id = a.id), '[]'::jsonb),
    'parcelas', coalesce((select jsonb_agg(jsonb_build_array(p.numero, p.valor, p.vencimento)
      order by p.numero, p.id) from public.parcelas_acordo p where p.acordo_id = a.id), '[]'::jsonb)
  )
$$;

create function public.acordo_revisao_adm(a public.acordos)
returns text language sql stable set search_path = '' as $$
  select md5(public.acordo_cadastro_para_homologacao(a)::text || coalesce((
    select h.id::text from public.acordo_homologacoes_adm h
    where h.acordo_id = a.id and h.carteira_id = a.carteira_id
    order by h.criado_em desc, h.id desc limit 1
  ), ''))
$$;

create function public.acordo_homologado(a public.acordos)
returns boolean language sql stable set search_path = '' as $$
  select coalesce((
    select h.conferido and h.cadastro = public.acordo_cadastro_para_homologacao(a)
    from public.acordo_homologacoes_adm h where h.acordo_id = a.id and h.carteira_id = a.carteira_id
    order by h.criado_em desc, h.id desc limit 1
  ), false)
$$;

revoke all on function public.acordo_cadastro_para_homologacao(public.acordos),
  public.acordo_revisao_adm(public.acordos), public.acordo_homologado(public.acordos) from public, anon;
grant execute on function public.acordo_cadastro_para_homologacao(public.acordos),
  public.acordo_revisao_adm(public.acordos), public.acordo_homologado(public.acordos) to authenticated, service_role;

create function public.acordo_registrar_homologacao_adm(
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
  if a.tipo is distinct from 'extrajudicial' or a.status in ('cancelado','quebrado','rompido','renegociado')
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
  if not exists(select 1 from public.acordo_formalizacao_eventos where acordo_id = a.id
    and carteira_id = a.carteira_id and evento = 'boletos_recebidos') then
    if a.status <> 'quitado' and exists(select 1 from public.acordo_formalizacao_eventos
      where acordo_id = a.id and carteira_id = a.carteira_id and evento = 'solicitacao_enviada') then
      perform public.acordo_confirmar_etapa_boletos(a.id, 'boletos_recebidos',
        'Recebimento confirmado com o registro ADM: ' || btrim(p_referencia));
    else
      -- O PDF também permite registrar a conferência dos acordos históricos
      -- cuja solicitação ocorreu fora da trilha do app.
      insert into public.acordo_formalizacao_eventos
        (acordo_id, carteira_id, evento, evidencia, origem, referencia, usuario_id)
      values (a.id, a.carteira_id, 'boletos_recebidos',
        'Recebimento confirmado com o registro ADM: ' || btrim(p_referencia),
        'confirmacao_manual', 'boletos_recebidos', auth.uid());
    end if;
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
revoke all on function public.acordo_registrar_homologacao_adm(uuid,text,text,text,text,boolean,text) from public, anon;
grant execute on function public.acordo_registrar_homologacao_adm(uuid,text,text,text,text,boolean,text) to authenticated;

create function public.acordo_baixar_homologacao_adm(p_id uuid)
returns table(nome text, pdf_base64 text) language sql stable security definer set search_path = '' as $$
  select h.nome_pdf, encode(h.documento, 'base64')
  from public.acordo_homologacoes_adm h join public.acordos a on a.id = h.acordo_id
  where h.id = p_id and h.carteira_id = a.carteira_id and auth.uid() is not null
    and public.current_user_can_access_carteira(a.carteira_id)
    and exists(select 1 from public.profiles where id = auth.uid() and role in ('admin','gestor','operador','leitura'))
$$;
revoke all on function public.acordo_baixar_homologacao_adm(uuid) from public, anon;
grant execute on function public.acordo_baixar_homologacao_adm(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
