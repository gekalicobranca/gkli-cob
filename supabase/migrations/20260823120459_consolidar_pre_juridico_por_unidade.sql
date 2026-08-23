-- A partir da geração do laudo, o acompanhamento pré-jurídico pertence à unidade.
-- Consolida eventuais casos antigos criados por cobrança, preservando o caso mais avançado.
create temporary table pre_juridico_casos_unidade_canonicos on commit drop as
select
  id as caso_id,
  first_value(id) over (
    partition by unidade_id
    order by
      case etapa
        when 'judicializado' then 9
        when 'autorizado_ajuizamento' then 8
        when 'pendencia_juridica' then 7
        when 'analise_juridica' then 6
        when 'enviado_juridico' then 5
        when 'pronto_juridico' then 4
        when 'confirmar_juridico' then 3
        when 'aguardando_sindico' then 2
        else 1
      end desc,
      updated_at desc,
      created_at asc,
      id
  ) as caso_canonico_id
from public.pre_juridico_casos
where unidade_id is not null;

delete from public.pre_juridico_casos caso
using pre_juridico_casos_unidade_canonicos mapa
where caso.id = mapa.caso_id
  and mapa.caso_id <> mapa.caso_canonico_id;

create unique index if not exists pre_juridico_casos_unidade_id_unique_idx
  on public.pre_juridico_casos (unidade_id)
  where unidade_id is not null;

comment on column public.pre_juridico_casos.unidade_id is
  'Unidade acompanhada como caso único após a geração do laudo; todas as cobranças da unidade integram o caso.';
