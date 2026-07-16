alter table public.condominios
  add column if not exists endereco_logradouro text,
  add column if not exists endereco_numero text,
  add column if not exists endereco_complemento text,
  add column if not exists endereco_bairro text,
  add column if not exists endereco_cidade text,
  add column if not exists endereco_uf text,
  add column if not exists endereco_cep text;

comment on column public.condominios.endereco_logradouro is
  'Logradouro do condominio para documentos operacionais e juridicos.';
comment on column public.condominios.endereco_numero is
  'Numero do endereco do condominio.';
comment on column public.condominios.endereco_complemento is
  'Complemento do endereco do condominio.';
comment on column public.condominios.endereco_bairro is
  'Bairro do endereco do condominio.';
comment on column public.condominios.endereco_cidade is
  'Cidade do endereco do condominio.';
comment on column public.condominios.endereco_uf is
  'UF do endereco do condominio.';
comment on column public.condominios.endereco_cep is
  'CEP do endereco do condominio.';
