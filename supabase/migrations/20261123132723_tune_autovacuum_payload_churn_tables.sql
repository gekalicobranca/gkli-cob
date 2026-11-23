-- Lower per-table vacuum thresholds for relations with sustained write churn.
-- This only changes maintenance scheduling; it does not remove or rewrite rows.
ALTER TABLE public.acordo_homologacoes_adm SET (
  autovacuum_vacuum_scale_factor = 0.05,
  toast.autovacuum_vacuum_scale_factor = 0.05
);

ALTER TABLE public.conversoes_relatorio SET (
  autovacuum_vacuum_scale_factor = 0.05,
  toast.autovacuum_vacuum_scale_factor = 0.05
);

ALTER TABLE public.captacao_historica_sindico SET (
  autovacuum_vacuum_scale_factor = 0.05
);

ALTER TABLE public.cobrancas SET (
  autovacuum_vacuum_scale_factor = 0.05
);

ALTER TABLE public.mensagens SET (
  autovacuum_vacuum_scale_factor = 0.05,
  toast.autovacuum_vacuum_scale_factor = 0.05
);
