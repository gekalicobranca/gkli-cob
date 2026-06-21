begin;

do $$
declare
  v_condominio_id uuid := '002bd8a3-3d2d-4409-822d-5396a1795b7c';
  v_carteira_id uuid := 'e1f6e3ac-1098-4b30-9e0f-af4c47b351a3';
  v_email text := 'juliocesarb73@gmail.com';
  v_telefone text := '+5511964809656';
  v_marker text := 'TESTE KEILA OPERACAO VIRTUAL';
begin
  update public.condominios
     set status = 'ativo',
         operacao_virtual_habilitada = true,
         updated_at = now()
   where id = v_condominio_id;

  delete from public.cobrancas
   where condominio_id = v_condominio_id
     and coalesce(observacoes, '') ilike '%' || v_marker || '%';

  delete from public.responsaveis_unidades
   where condominio_id = v_condominio_id
     and coalesce(observacoes, '') ilike '%' || v_marker || '%';

  delete from public.unidades
   where condominio_id = v_condominio_id
     and coalesce(observacoes, '') ilike '%' || v_marker || '%';

  with dados as (
    select *
      from (values
        (1, 'KEILA-001', 'Responsavel Teste Keila 01', date '2026-05-22', 185.50),
        (2, 'KEILA-002', 'Responsavel Teste Keila 02', date '2026-05-28', 240.75),
        (3, 'KEILA-003', 'Responsavel Teste Keila 03', date '2026-06-01', 312.30),
        (4, 'KEILA-004', 'Responsavel Teste Keila 04', date '2026-06-05', 455.90),
        (5, 'KEILA-005', 'Responsavel Teste Keila 05', date '2026-06-08', 520.10),
        (6, 'KEILA-006', 'Responsavel Teste Keila 06', date '2026-06-10', 680.00),
        (7, 'KEILA-007', 'Responsavel Teste Keila 07', date '2026-06-12', 735.45),
        (8, 'KEILA-008', 'Responsavel Teste Keila 08', date '2026-06-15', 820.20),
        (9, 'KEILA-009', 'Responsavel Teste Keila 09', date '2026-06-18', 990.00),
        (10, 'KEILA-010', 'Responsavel Teste Keila 10', date '2026-06-21', 1250.00)
      ) as t(ordem, unidade, responsavel, vencimento, valor)
  ),
  unidades_inseridas as (
    insert into public.unidades (
      carteira_id,
      condominio_id,
      identificacao,
      bloco,
      responsavel_nome,
      telefone,
      email,
      status,
      observacoes,
      created_at,
      updated_at
    )
    select
      v_carteira_id,
      v_condominio_id,
      unidade,
      'TESTE KEILA',
      responsavel,
      v_telefone,
      v_email,
      'ativa',
      v_marker || ' - unidade artificial para teste end-to-end',
      now(),
      now()
    from dados
    returning id, identificacao
  ),
  responsaveis_inseridos as (
    insert into public.responsaveis_unidades (
      carteira_id,
      condominio_id,
      unidade,
      bloco,
      responsavel_nome,
      telefone,
      email,
      origem,
      ativo,
      observacoes,
      tipo_responsavel,
      created_at,
      updated_at
    )
    select
      v_carteira_id,
      v_condominio_id,
      unidade,
      'TESTE KEILA',
      responsavel,
      v_telefone,
      v_email,
      'teste_keila',
      true,
      v_marker || ' - responsavel artificial para teste end-to-end',
      'proprietario',
      now(),
      now()
    from dados
    returning id
  )
  insert into public.cobrancas (
    carteira_id,
    condominio_id,
    unidade_id,
    competencia,
    vencimento,
    valor_original,
    valor_atualizado,
    status,
    status_operacional,
    status_financeiro,
    origem_importacao,
    observacoes,
    created_at,
    updated_at
  )
  select
    v_carteira_id,
    v_condominio_id,
    u.id,
    '06/2026',
    d.vencimento,
    d.valor,
    d.valor,
    'em_cobranca_ativa',
    'em_cobranca_ativa',
    'em_aberto',
    'teste_keila',
    v_marker || ' - cobranca artificial ' || lpad(d.ordem::text, 2, '0') || ' para teste de regua e comunicacao',
    now(),
    now()
  from dados d
  join unidades_inseridas u on u.identificacao = d.unidade;
end $$;

commit;
