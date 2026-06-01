-- Classificação operacional do condomínio
-- Se você já rodou este SQL, este arquivo serve apenas como referência da mudança aplicada ao pacote.

ALTER TABLE public.condominios
ADD COLUMN IF NOT EXISTS classificacao_operacional text
NOT NULL DEFAULT 'prata'
CHECK (classificacao_operacional IN ('ouro', 'prata', 'bronze'));

UPDATE public.condominios
SET classificacao_operacional = 'prata'
WHERE classificacao_operacional IS NULL
   OR classificacao_operacional NOT IN ('ouro', 'prata', 'bronze');
