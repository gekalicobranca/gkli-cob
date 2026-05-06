-- Tabelas de régua

create table reguas (
  id uuid primary key,
  nome text,
  tipo text,
  ativo boolean default true
);

create table regua_etapas (
  id uuid primary key,
  regua_id uuid,
  ordem int,
  delay_dias int,
  canal text,
  template text,
  tom text
);
