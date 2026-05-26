-- Escopo de uso dos templates de mensageria por carteira.
-- carteira_id null = template global, disponível para todas as carteiras.
-- carteira_id preenchido = template disponível apenas para a carteira indicada.

alter table public.mensagens_templates
  add column if not exists carteira_id uuid;

create index if not exists mensagens_templates_carteira_id_idx
  on public.mensagens_templates (carteira_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'mensagens_templates_carteira_id_fkey'
  ) THEN
    ALTER TABLE public.mensagens_templates
      ADD CONSTRAINT mensagens_templates_carteira_id_fkey
      FOREIGN KEY (carteira_id)
      REFERENCES public.carteiras(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;
