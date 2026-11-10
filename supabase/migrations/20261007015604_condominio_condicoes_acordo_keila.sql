begin;
alter table public.condominios add column despesas_acordo_avista_percentual numeric(5,2), add column despesas_acordo_parcelado_percentual numeric(5,2);
alter table public.condominios add constraint condominios_despesas_avista_validas check (despesas_acordo_avista_percentual between 0 and 100), add constraint condominios_despesas_parcelado_validas check (despesas_acordo_parcelado_percentual between 0 and 100);
create or replace function public.keila_negociar_acordo(p_caso uuid,p_unidade uuid,p_operacao text,p_dados jsonb,p_evidencia text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  caso public.central_pendencias%rowtype; cond public.condominios%rowtype; un public.unidades%rowtype;
  proposta jsonb; propostas jsonb; dados jsonb; ids uuid[]; itens jsonb;
  acordo uuid; n integer; base numeric; total numeric; percentual numeric; dias integer;
  etapa text; mensagem text; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into caso from public.central_pendencias where id=p_caso and tipo='keila_atendimento' for update;
  if not found or auth.uid() is null or public.current_user_can_access_carteira(caso.carteira_id) is not true
    or not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','gestor','operador')) then
    raise exception 'Sem permissÃ£o para negociar este atendimento.';
  end if;
  if caso.status in ('resolvida','cancelada') or caso.payload->>'estado' in ('atendimento_humano','concluido') then
    raise exception 'Atendimento encerrado ou sob prioridade humana.';
  end if;
  if not coalesce(caso.payload->'unidade_ids','[]'::jsonb) ? p_unidade::text then raise exception 'Unidade fora do caso.'; end if;
  select * into cond from public.condominios where id=caso.condominio_id;
  if cond.operacao_virtual_habilitada is not true then raise exception 'Agente autÃ´nomo desabilitado no condomÃ­nio.'; end if;
  select * into un from public.unidades where id=p_unidade and condominio_id=cond.id and carteira_id=caso.carteira_id;
  if not found or un.acao_judicial then raise exception 'Unidade invÃ¡lida ou judicializada.'; end if;
  if p_operacao not in ('propor','aceitar') or nullif(trim(p_evidencia),'') is null or length(p_evidencia)>4000 then
    raise exception 'OperaÃ§Ã£o ou evidÃªncia invÃ¡lida.';
  end if;
  propostas:=coalesce(caso.payload->'acordos','[]'::jsonb);
  select value into proposta from jsonb_array_elements(propostas) where value->>'unidade_id'=p_unidade::text;
  if p_operacao='aceitar' and proposta is null then raise exception 'Prepare a proposta antes do aceite.'; end if;
  if proposta->>'etapa' in ('acordo_firmado','acordo_efetivado') then return proposta; end if;
  dados:=case when p_operacao='propor' then p_dados else proposta end;
  n:=jsonb_array_length(dados->'parcelas');
  if n not in (1,3) then raise exception 'Permitido Ã  vista ou em 3 parcelas.'; end if;
  if n>1 and n>coalesce(cond.parcelas_acordo_sem_aprovacao_sindico,0) then raise exception 'Parcelamento exige aprovaÃ§Ã£o do sÃ­ndico.'; end if;
  if (dados->'parcelas'->0->>'vencimento')::date<hoje then raise exception 'Vencimento no passado.'; end if;
  percentual:=case when n=1 then cond.despesas_acordo_avista_percentual else cond.despesas_acordo_parcelado_percentual end;
  if percentual is null then raise exception 'Configure os percentuais de despesas no condomínio.'; end if;
  dias:=coalesce(cond.dias_apos_vencimento_regua,cond.inicio_cobranca_dias,30);
  select array_agg((i->>'cobranca_id')::uuid) into ids from jsonb_array_elements(dados->'itens') i;
  if ids is null or cardinality(ids)=0 or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'CobranÃ§as invÃ¡lidas.'; end if;
  perform 1 from public.cobrancas where id=any(ids) order by id for update;
  if (select count(*) from public.cobrancas where id=any(ids))<>cardinality(ids) or exists(
    select 1 from public.cobrancas c where c.id=any(ids) and (
      c.condominio_id is distinct from cond.id or c.unidade_id is distinct from p_unidade or c.carteira_id is distinct from caso.carteira_id
      or c.duplicada_de_id is not null or c.valor_atualizado is null or c.valor_atualizado<=0
      or coalesce(c.status_financeiro,'em_aberto')<>'em_aberto'
      or coalesce(c.status_operacional,c.status,'novo') not in ('novo','em_cobranca_ativa','em_negociacao','possivel_acordo')
      or c.vencimento is null or hoje-c.vencimento<dias
      or (cond.bloqueio_garantidora_habilitado and c.vencimento between cond.bloqueio_garantidora_inicio and cond.bloqueio_garantidora_fim)
    )) then raise exception 'HÃ¡ cobranÃ§a fora da rÃ©gua, bloqueada ou fora da unidade.'; end if;
  if exists(select 1 from public.acordo_cobrancas ac join public.acordos a on a.id=ac.acordo_id
    where ac.cobranca_id=any(ids) and a.status not in ('cancelado','quebrado','renegociado')) then raise exception 'CobranÃ§a jÃ¡ vinculada a outro acordo.'; end if;
  if exists(select 1 from jsonb_array_elements(dados->'itens') i join public.cobrancas c on c.id=(i->>'cobranca_id')::uuid
    where round(c.valor_atualizado,2) is distinct from (i->>'valor_atualizado_no_acordo')::numeric) then
    raise exception 'Saldo alterado desde a proposta. Confira e apresente novamente.';
  end if;
  select sum(round(valor_atualizado,2)) into base from public.cobrancas where id=any(ids);
  total:=base+round(base*percentual/100,2);
  if (dados->>'total')::numeric is distinct from total or (dados->>'base')::numeric is distinct from base
    or (dados->>'despesas')::numeric is distinct from round(base*percentual/100,2)
    or (dados->>'percentual')::numeric is distinct from percentual
    or (select sum((p->>'valor')::numeric) from jsonb_array_elements(dados->'parcelas') p) is distinct from total
    or (select sum((i->>'encargos_no_acordo')::numeric) from jsonb_array_elements(dados->'itens') i) is distinct from round(base*percentual/100,2)
    or exists(select 1 from jsonb_array_elements(dados->'itens') i where (i->>'encargos_no_acordo')::numeric<0
      or (i->>'valor_total_no_acordo')::numeric is distinct from (i->>'valor_atualizado_no_acordo')::numeric+(i->>'encargos_no_acordo')::numeric)
    then raise exception 'Valores financeiros divergentes.'; end if;
  if exists(select 1 from jsonb_array_elements(dados->'parcelas') with ordinality p(value,ord)
    where (value->>'numero')::integer<>ord or (value->>'valor')::numeric<=0
      or value->>'status'<>'aberta' or value->>'tipo_parcela'<>'parcela'
      or (value->>'vencimento')::date <> ((dados->'parcelas'->0->>'vencimento')::date + make_interval(months=>(ord-1)::integer))::date) then
    raise exception 'Parcelas ou vencimentos invÃ¡lidos.';
  end if;
  if p_operacao='propor' then
    etapa:='possivel_acordo';
    proposta:=dados||jsonb_build_object('id',coalesce(proposta->>'id',gen_random_uuid()::text),'unidade_id',p_unidade,
      'unidade',un.identificacao,'exige_aprovacao',n>1 and coalesce(cond.parcelas_acordo_sem_aprovacao_sindico,0)>0 and n>cond.parcelas_acordo_sem_aprovacao_sindico,'etapa',etapa,'destinatario',null,'cc',(select coalesce(jsonb_agg(distinct e->>'remetente'),'[]'::jsonb) from jsonb_array_elements(caso.payload->'emails') e),'assunto','');
    update public.cobrancas set status=etapa,status_operacional=etapa where id=any(ids);
    mensagem:='Proposta preparada com vencimento em '||(dados->'parcelas'->0->>'vencimento')||'. Sem envio de e-mail.';
  else
    select jsonb_agg(i||jsonb_build_object('valor_original_no_acordo',c.valor_original)) into itens
      from jsonb_array_elements(dados->'itens') i join public.cobrancas c on c.id=(i->>'cobranca_id')::uuid;
    acordo:=public.criar_acordo_financeiro(caso.carteira_id,ids[1],cond.id,p_unidade,'extrajudicial',null,total,0,
      percentual,round(base*percentual/100,2),hoje,'ativo','aceito_aguardando_boletos',false,null,'Keila:'||caso.id,itens,dados->'parcelas','acordo_firmado');
    update public.acordos set devedor_aceito_em=now() where id=acordo;
    etapa:='acordo_firmado';
    proposta:=proposta||jsonb_build_object('id',acordo,'etapa',etapa,'assunto','[Acordo '||acordo||'] '||cond.nome||' â€” unidade '||un.identificacao||' â€” cadastro e boletos');
    mensagem:='Aceite registrado; acordo '||acordo||' criado. SolicitaÃ§Ã£o de cadastro e boletos preparada, ainda nÃ£o enviada.';
  end if;
  select coalesce(jsonb_agg(value),'[]'::jsonb) into propostas from jsonb_array_elements(propostas) where value->>'unidade_id'<>p_unidade::text;
  propostas:=propostas||jsonb_build_array(proposta);
  update public.central_pendencias set payload=caso.payload||jsonb_build_object('acordos',propostas,'estado','proposta_preparada',
    'proxima_acao',case when (proposta->>'exige_aprovacao')::boolean then 'Encaminhar o pedido para aprovação do condomínio e acompanhar a resposta. Nenhum encaminhamento foi enviado.' when p_operacao='propor' then 'Apresentar proposta e registrar o aceite real.' else 'Confirmar contato de cobranÃ§a e solicitar cadastro do acordo e boletos, com o condÃ´mino em cÃ³pia.' end,
    'atividades',coalesce(caso.payload->'atividades','[]'::jsonb)||jsonb_build_array(jsonb_build_object('em',now(),'descricao',mensagem||' EvidÃªncia: '||p_evidencia,'usuario_id',auth.uid()))),
    updated_at=now() where id=caso.id;
  return proposta;
end $$;
revoke all on function public.keila_negociar_acordo(uuid,uuid,text,jsonb,text) from public,anon;
grant execute on function public.keila_negociar_acordo(uuid,uuid,text,jsonb,text) to authenticated;


commit;
