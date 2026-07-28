create or replace function public.listar_tabelas_backup()
returns table (table_name text, column_names text[])
language sql
security definer
set search_path = pg_catalog, public
as $$
  select
    tables.tablename::text,
    array_agg(attributes.attname::text order by attributes.attnum)
  from pg_catalog.pg_tables as tables
  join pg_catalog.pg_class as classes on classes.relname = tables.tablename
  join pg_catalog.pg_namespace as namespaces
    on namespaces.oid = classes.relnamespace
   and namespaces.nspname = tables.schemaname
  join pg_catalog.pg_attribute as attributes
    on attributes.attrelid = classes.oid
   and attributes.attnum > 0
   and not attributes.attisdropped
  where tables.schemaname = 'public'
  group by tables.tablename
  order by tables.tablename;
$$;

revoke all on function public.listar_tabelas_backup() from public, anon, authenticated;
grant execute on function public.listar_tabelas_backup() to service_role;

comment on function public.listar_tabelas_backup() is
  'Catálogo mínimo usado pela exportação administrativa de emergência.';

create or replace function public.exportar_esquema_backup()
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result text := '-- Esquema atual exportado em ' || now()::text || E'\n'
    || '-- Aplicar em um projeto vazio. Revise extensões e integrações gerenciadas separadamente.'
    || E'\n\n';
  item record;
begin
  for item in
    select
      format(
        'create type %I.%I as enum (%s);',
        namespaces.nspname,
        types.typname,
        string_agg(quote_literal(enums.enumlabel), ', ' order by enums.enumsortorder)
      ) as ddl
    from pg_catalog.pg_type as types
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = types.typnamespace
    join pg_catalog.pg_enum as enums on enums.enumtypid = types.oid
    where namespaces.nspname = 'public'
    group by namespaces.nspname, types.typname
    order by types.typname
  loop
    result := result || item.ddl || E'\n';
  end loop;

  for item in
    select format(
      E'create table %I.%I (\n%s\n);',
      namespaces.nspname,
      classes.relname,
      string_agg(
        format(
          '  %I %s%s%s',
          attributes.attname,
          pg_catalog.format_type(attributes.atttypid, attributes.atttypmod),
          case when defaults.adbin is not null
            then ' default ' || pg_catalog.pg_get_expr(defaults.adbin, defaults.adrelid)
            else ''
          end,
          case when attributes.attnotnull then ' not null' else '' end
        ),
        E',\n' order by attributes.attnum
      )
    ) as ddl
    from pg_catalog.pg_class as classes
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = classes.relnamespace
    join pg_catalog.pg_attribute as attributes
      on attributes.attrelid = classes.oid
     and attributes.attnum > 0
     and not attributes.attisdropped
    left join pg_catalog.pg_attrdef as defaults
      on defaults.adrelid = classes.oid
     and defaults.adnum = attributes.attnum
    where namespaces.nspname = 'public'
      and classes.relkind in ('r', 'p')
    group by namespaces.nspname, classes.relname
    order by classes.relname
  loop
    result := result || E'\n' || item.ddl || E'\n';
  end loop;

  for item in
    select format(
      'alter table %I.%I add constraint %I %s;',
      namespaces.nspname,
      classes.relname,
      constraints.conname,
      pg_catalog.pg_get_constraintdef(constraints.oid, true)
    ) as ddl
    from pg_catalog.pg_constraint as constraints
    join pg_catalog.pg_class as classes on classes.oid = constraints.conrelid
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = classes.relnamespace
    where namespaces.nspname = 'public'
    order by classes.relname, constraints.conname
  loop
    result := result || item.ddl || E'\n';
  end loop;

  for item in
    select pg_catalog.pg_get_indexdef(indexes.indexrelid) || ';' as ddl
    from pg_catalog.pg_index as indexes
    join pg_catalog.pg_class as tables on tables.oid = indexes.indrelid
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = tables.relnamespace
    left join pg_catalog.pg_constraint as constraints
      on constraints.conindid = indexes.indexrelid
    where namespaces.nspname = 'public'
      and constraints.oid is null
    order by indexes.indexrelid::regclass::text
  loop
    result := result || item.ddl || E'\n';
  end loop;

  for item in
    select pg_catalog.pg_get_functiondef(procedures.oid) || E'\n' as ddl
    from pg_catalog.pg_proc as procedures
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = procedures.pronamespace
    where namespaces.nspname = 'public'
      and procedures.proname not in ('listar_tabelas_backup', 'exportar_esquema_backup')
    order by procedures.proname, procedures.oid
  loop
    result := result || E'\n' || item.ddl;
  end loop;

  for item in
    select format(
      'create or replace view %I.%I as %s;',
      schemaname,
      viewname,
      definition
    ) as ddl
    from pg_catalog.pg_views
    where schemaname = 'public'
    order by viewname
  loop
    result := result || E'\n' || item.ddl || E'\n';
  end loop;

  for item in
    select pg_catalog.pg_get_triggerdef(triggers.oid, true) || ';' as ddl
    from pg_catalog.pg_trigger as triggers
    join pg_catalog.pg_class as classes on classes.oid = triggers.tgrelid
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = classes.relnamespace
    where namespaces.nspname = 'public'
      and not triggers.tgisinternal
    order by classes.relname, triggers.tgname
  loop
    result := result || item.ddl || E'\n';
  end loop;

  for item in
    select
      format(
        'create policy %I on %I.%I as %s for %s to %s%s%s;',
        policyname,
        schemaname,
        tablename,
        permissive,
        cmd,
        array_to_string(roles, ', '),
        case when qual is not null then ' using (' || qual || ')' else '' end,
        case when with_check is not null then ' with check (' || with_check || ')' else '' end
      ) as ddl
    from pg_catalog.pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  loop
    result := result || item.ddl || E'\n';
  end loop;

  for item in
    select format(
      'alter table %I.%I enable row level security;',
      namespaces.nspname,
      classes.relname
    ) as ddl
    from pg_catalog.pg_class as classes
    join pg_catalog.pg_namespace as namespaces on namespaces.oid = classes.relnamespace
    where namespaces.nspname = 'public'
      and classes.relrowsecurity
    order by classes.relname
  loop
    result := result || item.ddl || E'\n';
  end loop;

  return result;
end;
$$;

revoke all on function public.exportar_esquema_backup() from public, anon, authenticated;
grant execute on function public.exportar_esquema_backup() to service_role;
