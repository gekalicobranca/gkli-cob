SET lock_timeout = '5s';
CREATE INDEX IF NOT EXISTS idx_agente_arquivos_execucao_id ON public.agente_arquivos (execucao_id);
CREATE INDEX IF NOT EXISTS idx_email_tentativas_mensagem_id ON public.email_tentativas (mensagem_id);
