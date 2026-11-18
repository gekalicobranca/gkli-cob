-- Mantém a serialização por unidade, mas não bloqueia um novo acordo só porque
-- já existe outro acordo vigente na mesma unidade. A proteção seguinte da RPC
-- continua impedindo reutilizar uma cobrança que já esteja em outro acordo.
do $migration$
declare
  assinatura regprocedure := 'public.criar_acordo_financeiro(uuid,uuid,uuid,uuid,text,text,numeric,numeric,numeric,numeric,date,text,text,boolean,text,text,jsonb,jsonb,text)'::regprocedure;
  definicao text := pg_get_functiondef(assinatura);
  marcador_inicio text := '-- BLOQUEIO_SEGUNDO_ACORDO_ABERTO_UNIDADE';
  marcador_fim text := '-- BLOQUEIO_COBRANCA_EM_OUTRO_ACORDO';
  pos_inicio integer := strpos(definicao, marcador_inicio);
  pos_fim integer := strpos(definicao, marcador_fim);
  guarda text := $guard$
  -- BLOQUEIO_SEGUNDO_ACORDO_ABERTO_UNIDADE
  -- O lock serializa novas propostas para a unidade. A exclusividade é por cota,
  -- verificada em BLOQUEIO_COBRANCA_EM_OUTRO_ACORDO logo abaixo.
  perform 1
  from public.unidades u
  where u.id = p_unidade_id or u.id in (
    select c.unidade_id from public.cobrancas c
    join jsonb_to_recordset(p_itens) i(cobranca_id uuid) on i.cobranca_id = c.id
  )
  order by u.id
  for no key update;

$guard$;
begin
  if pos_inicio = 0 or pos_fim = 0 or pos_fim <= pos_inicio then
    raise exception 'Pontos de validação dos acordos não encontrados ou fora de ordem.';
  end if;

  execute overlay(definicao placing guarda from pos_inicio for pos_fim - pos_inicio);
end;
$migration$;
