alter table public.unidades add column if not exists numero_processo text;

comment on column public.unidades.numero_processo is
  'Número do processo judicial informado no cadastro da unidade, no formato CNJ.';

alter table public.unidades add constraint unidades_numero_processo_formato
  check (numero_processo is null or numero_processo ~ '^[0-9]{7}-[0-9]{2}\.[0-9]{4}\.[0-9]\.[0-9]{2}\.[0-9]{4}$');

notify pgrst, 'reload schema';
