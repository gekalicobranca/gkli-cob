-- Cada carteira deve possuir sua própria régua pré-jurídica.
-- A migração é idempotente: preserva réguas existentes e completa apenas o que falta.

insert into public.reguas (
  carteira_id,
  nome,
  tipo,
  status,
  ativo,
  descricao,
  prioridade,
  padrao,
  destinatario_preferencial,
  created_at,
  updated_at
)
select
  carteira.id,
  'Pré-Jurídico · ' || carteira.nome,
  'juridico',
  'ativa',
  true,
  'Régua de envio do pacote pré-jurídico: carteira, administradora e síndico.',
  90,
  false,
  'qualquer',
  now(),
  now()
from public.carteiras carteira
where not exists (
  select 1
  from public.reguas existente
  where existente.carteira_id = carteira.id
    and existente.tipo = 'juridico'
    and existente.ativo = true
);

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
  ativo,
  created_at,
  updated_at
)
select
  regua.id,
  etapa.ordem,
  etapa.nome,
  0,
  'acordo',
  'email',
  etapa.template,
  etapa.categoria_template,
  'medio',
  'enviar_mensagem',
  true,
  now(),
  now()
from public.reguas regua
cross join (
  values
    (1, 'Pacote para carteira', 'pre_juridico_carteira', 'Olá, {{primeiro_nome}}. O pacote pré-jurídico da unidade {{unidade}} do {{condominio}} está pronto. Laudo: {{link_laudo}}. Procuração: {{link_procuracao}}.'),
    (2, 'Lista para administradora', 'pre_juridico_administradora', 'Olá, {{primeiro_nome}}. Segue a lista pré-jurídica dos acordos quebrados vinculados à administradora {{administradora}}. Lista: {{link_lista_administradora}}.'),
    (3, 'Procuração para síndico', 'pre_juridico_sindico', 'Olá, {{primeiro_nome}}. Segue a procuração para assinatura referente à unidade {{unidade}} do {{condominio}}. Procuração: {{link_procuracao}}.')
) as etapa(ordem, nome, categoria_template, template)
where regua.tipo = 'juridico'
  and regua.carteira_id is not null
  and regua.ativo = true
  and not exists (
    select 1
    from public.regua_etapas existente
    where existente.regua_id = regua.id
      and existente.categoria_template = etapa.categoria_template
  );
