-- Keep extension objects outside public to reduce the public schema surface.
create schema if not exists extensions;

alter extension unaccent set schema extensions;
alter extension pg_trgm set schema extensions;
