begin;
alter table public.agente_acordos_configuracoes drop constraint agente_acordos_configuracoes_codigo_cliente_check;
alter table public.agente_acordos_configuracoes add constraint agente_acordos_configuracoes_codigo_cliente_check check (codigo_cliente ~ '^[0-9]+$' or (administradora = 'ATIPASS' and codigo_cliente = condominio_id::text));
commit;
