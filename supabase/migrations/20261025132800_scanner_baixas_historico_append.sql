-- O executor pode acrescentar e consultar baixas, mas não editar ou apagar o histórico.
revoke update,delete,truncate,references,trigger on public.scanner_baixas from service_role;
grant select,insert on public.scanner_baixas to service_role;
