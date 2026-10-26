-- Mantém a mesma RPC, a autenticação e o bloqueio transacional por cobrança.
-- acordos.unidade_id é a titular; acordo_cobrancas preserva cada unidade de origem.
do $migration$
declare
  assinatura regprocedure := 'public.criar_acordo_financeiro(uuid,uuid,uuid,uuid,text,text,numeric,numeric,numeric,numeric,date,text,text,boolean,text,text,jsonb,jsonb,text)'::regprocedure;
  src text;
  guarda text := $guard$
  -- ACORDO_MULTIPLAS_UNIDADES_TITULAR
  if not exists(select 1 from public.unidades u
    where u.id=p_unidade_id and u.condominio_id=p_condominio_id and u.carteira_id=p_carteira_id)
    or not exists(select 1 from public.cobrancas c where c.id=p_cobranca_id and c.unidade_id=p_unidade_id)
  then raise exception 'A unidade titular deve pertencer ao condomínio e ter uma cobrança selecionada.'; end if;
  if exists(select 1 from jsonb_to_recordset(p_itens) i(cobranca_id uuid)
    join public.cobrancas c on c.id=i.cobranca_id
    where not exists(select 1 from public.unidades u where u.id=c.unidade_id
      and u.condominio_id=p_condominio_id and u.carteira_id=p_carteira_id))
  then raise exception 'Todas as unidades devem pertencer ao mesmo condomínio e carteira.'; end if;
  if exists(select 1 from public.central_pendencias cp
    where cp.carteira_id=p_carteira_id and cp.condominio_id=p_condominio_id
      and cp.tipo in ('planilha_debitos_administradora','aprovacao_acordo_sindico')
      and cp.status in ('aberta','em_tratamento')
      and cp.unidade_id in (select c.unidade_id from public.cobrancas c
        join jsonb_to_recordset(p_itens) i(cobranca_id uuid) on i.cobranca_id=c.id))
  then raise exception 'Existe pendência administrativa aberta em uma das unidades selecionadas.'; end if;
  if exists(select 1 from public.cobrancas c
    join jsonb_to_recordset(p_itens) i(cobranca_id uuid) on i.cobranca_id=c.id
    where (c.status='judicializado' or c.status_operacional='judicializado'))
    and not (p_tipo='judicial' and coalesce(p_numero_processo,'') ~ '^[0-9]{7}-[0-9]{2}\.[0-9]{4}\.[0-9]\.[0-9]{2}\.[0-9]{4}$')
  then raise exception 'Cobrança judicializada: somente acordo judicial com CNJ válido é permitido.'; end if;
$guard$;
begin
  src:=replace(pg_get_functiondef(assinatura),E'\r','');
  if position('ACORDO_MULTIPLAS_UNIDADES_TITULAR' in src)>0 then return; end if;
  if position('or c.unidade_id is distinct from p_unidade_id' in src)=0
    or position('-- BLOQUEIO_COBRANCA_EM_OUTRO_ACORDO' in src)=0
    or position(E'  for update;\n' in src)=0 then
    raise exception 'Estrutura da RPC mudou; revisar migração de unidade titular.';
  end if;
  src:=replace(src,'or c.unidade_id is distinct from p_unidade_id','');
  src:=replace(src,'As cobrancas do acordo precisam existir e pertencer a mesma carteira, condominio e unidade.',
    'As cobranças do acordo precisam existir e pertencer ao mesmo condomínio e carteira.');
  src:=replace(src,E'  for update;\n',E'  for update;\n'||guarda);
  execute src;
end $migration$;
