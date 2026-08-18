insert into public.regua_etapas (
  regua_id,
  ordem,
  nome,
  delay_dias,
  delay_referencia,
  canal,
  template,
  categoria_template,
  tom,
  acao,
  ativo
)
select
  r.id,
  etapa.ordem,
  etapa.nome,
  etapa.delay_dias,
  'acordo',
  'email',
  etapa.template,
  etapa.categoria_template,
  'medio',
  'enviar_mensagem',
  true
from public.reguas r
cross join (
  values
    (1, 'Pacote para carteira', 0, 'pre_juridico_carteira', 'Olá, {{primeiro_nome}}. O pacote pré-jurídico da unidade {{unidade}} do {{condominio}} está pronto. Laudo: {{link_laudo}}. Procuração: {{link_procuracao}}.'),
    (2, 'Lista para administradora', 0, 'pre_juridico_administradora', 'Olá, {{primeiro_nome}}. Segue a lista pré-jurídica dos acordos quebrados vinculados à administradora {{administradora}}. Lista: {{link_lista_administradora}}.'),
    (3, 'Procuração para síndico', 0, 'pre_juridico_sindico', 'Olá, {{primeiro_nome}}. Segue a procuração para assinatura referente à unidade {{unidade}} do {{condominio}}. Procuração: {{link_procuracao}}.')
) as etapa(ordem, nome, delay_dias, categoria_template, template)
where r.tipo = 'juridico'
  and not exists (
    select 1
    from public.regua_etapas existente
    where existente.regua_id = r.id
      and existente.categoria_template = etapa.categoria_template
  );
