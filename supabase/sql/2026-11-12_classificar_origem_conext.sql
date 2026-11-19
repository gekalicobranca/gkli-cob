-- Aplicar após a migração de origem. CO. NEXT Liberdade, período 11/10 a 11/11/2026.
-- Referências confrontadas por unidade, data, valor e fonte da administradora.
begin;

do $classificacao$
declare
  condominio constant uuid := '6923a54f-a44f-4a32-80a7-bafd718b52d2';
  proprios constant text[] := array[
    '1398636', '1398654', '1398660', '1398668', '1398670',
    '1398672', '1403035', '1403353', '1405210', '1407267'
  ];
  externos constant text[] := array[
    '1404076', '1404073', '1404070', '1404067', '1404059', '1404058', '1403991', '1403982',
    '1404136', '1404470', '1405124', '1404756', '1405120', '1404761', '1404760', '1404753',
    '1409204', '1409203', '1406504'
  ];
  anteriores constant text[] := array[
    '1371336', '1371339', '1371341', '1371342', '1371361', '1371458', '1371461',
    '1371464', '1371481', '1371488', '1371489', '1371494', '1371496'
  ];
  registro record;
  atualizados integer := 0;
begin
  if not exists (select 1 from public.condominios c
    where c.id = condominio and regexp_replace(c.cnpj, '[^0-9]', '', 'g') = '55597288000115') then
    raise exception 'Cadastro de CO. NEXT Liberdade não confere.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('acordos_origem_fechamento', 0));

  for registro in
    select a.id, a.carteira_id, f.numero_acordo
    from public.acordos_fontes_lello f
    join public.acordos a on a.id = f.acordo_id and a.condominio_id = f.condominio_id
    where f.codigo_condominio = '62905' and f.condominio_id = condominio
      and f.numero_acordo = any(proprios || externos || anteriores || array['1398284'])
    order by a.id
  loop
    perform public.acordo_classificar_origem(
      registro.id,
      case
        when registro.numero_acordo = any(proprios) then 'carteira'
        when registro.numero_acordo = any(externos) then 'externo'
        else 'a_confirmar'
      end,
      case
        when registro.numero_acordo = any(proprios) then 'Autoria confirmada na lista da GEKALI para o CO. NEXT Liberdade.'
        when registro.numero_acordo = any(externos) then 'Acordo do espelho da administradora no período, fora da relação de acordos da GEKALI.'
        when registro.numero_acordo = '1398284' then 'Histórico atribui o acordo à Danielle, mas o registro está ausente da lista da GEKALI para o período.'
        else 'Acordo anterior ao período com parcela ou baixa no período. Autoria pendente de confirmação.'
      end
    );
    if registro.numero_acordo = any(proprios) then
      insert into public.auditoria_eventos
        (carteira_id, entidade_tipo, entidade_id, evento_tipo, titulo, descricao, depois)
      select registro.carteira_id, 'acordo', registro.id, 'acordo_origem_confirmada',
        'Autoria GEKALI confirmada', 'Lista do CO. NEXT Liberdade para 11/10 a 11/11/2026.',
        jsonb_build_object('origem_controle', 'carteira', 'referencia_administradora', registro.numero_acordo)
      where not exists (select 1 from public.auditoria_eventos e
        where e.entidade_id = registro.id and e.entidade_tipo = 'acordo'
          and e.evento_tipo = 'acordo_origem_confirmada' and e.depois->>'referencia_administradora' = registro.numero_acordo);
    end if;
    atualizados := atualizados + 1;
  end loop;

  if atualizados <> 43 then
    raise exception 'Esperados 43 acordos do CO. NEXT para classificação, localizados %.', atualizados;
  end if;
end;
$classificacao$;

commit;
