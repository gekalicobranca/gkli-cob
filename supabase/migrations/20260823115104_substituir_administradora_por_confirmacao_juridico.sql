alter table public.pre_juridico_casos
  drop constraint if exists pre_juridico_casos_etapa_check;

update public.pre_juridico_casos
set etapa = 'confirmar_juridico'
where etapa = 'aguardando_administradora';

alter table public.pre_juridico_casos
  add constraint pre_juridico_casos_etapa_check check (etapa in (
    'aguardando_documentos', 'aguardando_sindico', 'confirmar_juridico',
    'pronto_juridico', 'enviado_juridico', 'analise_juridica',
    'pendencia_juridica', 'autorizado_ajuizamento', 'judicializado'
  ));
