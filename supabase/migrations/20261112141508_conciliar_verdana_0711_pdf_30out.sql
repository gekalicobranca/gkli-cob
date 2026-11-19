-- Conciliacao pontual autorizada: Verdana Moradia Torre 3, unidade 0711.
-- Fonte: Print Preview 2.pdf, posicao de 30/10/2026.
-- A cota de agosto ja existia e foi retirada pelo Maestro em 10/11.
-- O bloqueio de edicao do arquivo e suspenso apenas dentro desta transacao;
-- o mesmo registro e restaurado, sem duplicar recibo, e o bloqueio e reativado.
do $conciliacao$
declare
  v_agosto public.cobrancas%rowtype;
  v_outubro public.cobrancas%rowtype;
  v_antes_agosto jsonb;
  v_antes_outubro jsonb;
  v_mensagem uuid;
begin
  select c.* into strict v_agosto
  from public.cobrancas c
  join public.unidades u on u.id = c.unidade_id
  join public.condominios co on co.id = c.condominio_id
  where co.nome = 'VERDANA SUITES JARDIM PRUDENCIA SETOR MORADIA TORRE 3'
    and u.identificacao = '0711' and u.bloco = '0'
    and c.vencimento = date '2026-08-10'
    and c.valor_original = 585.71
    and c.observacoes like '%recibo 2563476 J%'
    and c.duplicada_de_id is null
  for update of c;

  select c.* into strict v_outubro
  from public.cobrancas c
  where c.unidade_id = v_agosto.unidade_id
    and c.condominio_id = v_agosto.condominio_id
    and c.vencimento = date '2026-10-10'
    and c.valor_original = 530.35
    and c.observacoes like '%recibo 2670161%'
    and c.duplicada_de_id is null
  for update of c;

  if v_agosto.arquivada_em is null or v_agosto.status_financeiro <> 'em_aberto'
     or v_agosto.valor_atualizado <> 615.76
     or v_outubro.arquivada_em is not null or v_outubro.status_financeiro <> 'em_aberto'
     or v_outubro.valor_atualizado <> 546.54 then
    raise exception 'Estado das cobrancas mudou; conciliacao cancelada';
  end if;

  if (select count(*) from public.cobranca_parcelas where cobranca_id = v_agosto.id) <> 1
     or (select count(*) from public.cobranca_parcelas where cobranca_id = v_outubro.id) <> 1 then
    raise exception 'Parcelas inesperadas; conciliacao cancelada';
  end if;

  select m.id into strict v_mensagem
  from public.mensagens m
  where m.cobranca_id = v_outubro.id and m.status = 'pendente_aprovacao'
  for update;

  v_antes_agosto := to_jsonb(v_agosto);
  v_antes_outubro := to_jsonb(v_outubro);

  -- ALTER TABLE toma lock exclusivo; nenhuma outra sessao pode atualizar
  -- cobrancas durante a janela em que o trigger esta desabilitado.
  execute 'alter table public.cobrancas disable trigger zzz_proteger_arquivo_operacional_cobranca';

  update public.cobrancas
  set arquivada_em = null,
      arquivamento_motivo = null,
      automacao_bloqueada = false,
      status = 'em_cobranca_ativa',
      status_operacional = 'em_cobranca_ativa',
      juros = 16.25,
      valor_atualizado = 618.57,
      observacao_financeira = 'Conciliação manual conforme Print Preview 2.pdf, posição de 30/10/2026. Recibo 2563476 J. Arquivamento anterior preservado na auditoria.',
      updated_at = now()
  where id = v_agosto.id;

  execute 'alter table public.cobrancas enable trigger zzz_proteger_arquivo_operacional_cobranca';

  update public.cobrancas
  set juros = 3.61,
      valor_atualizado = 544.57,
      observacao_financeira = 'Conciliação manual conforme Print Preview 2.pdf, posição de 30/10/2026. Recibo 2670161.',
      updated_at = now()
  where id = v_outubro.id;

  update public.cobranca_parcelas
  set valor_atualizado = 618.57
  where cobranca_id = v_agosto.id;

  update public.cobranca_parcelas
  set valor_atualizado = 544.57
  where cobranca_id = v_outubro.id;

  perform public.flow_cancelar_mensagem(v_mensagem);

  insert into public.auditoria_eventos
    (carteira_id, entidade_tipo, entidade_id, evento_tipo, titulo, descricao,
     usuario_nome, antes, depois, diferencas)
  values
    (v_agosto.carteira_id, 'cobranca', v_agosto.id, 'cobranca.restaurada',
     'Recibo 2563476 restaurado e conciliado',
     'A pedido do usuário, posição de 30/10/2026 do Print Preview 2.pdf. O Maestro havia arquivado o recibo por ausência na captação de novembro.',
     'Codex (instrução do usuário)', v_antes_agosto,
     (select to_jsonb(c) from public.cobrancas c where c.id = v_agosto.id),
     jsonb_build_object('fonte', 'Print Preview 2.pdf', 'data_posicao', '2026-10-30',
                        'recibo', '2563476', 'valor_anterior', 615.76, 'valor_novo', 618.57)),
    (v_outubro.carteira_id, 'cobranca', v_outubro.id, 'cobranca.conciliada',
     'Recibo 2670161 conciliado',
     'Valor ajustado à posição de 30/10/2026 do Print Preview 2.pdf; rascunho de mensagem com dados anteriores cancelado.',
     'Codex (instrução do usuário)', v_antes_outubro,
     (select to_jsonb(c) from public.cobrancas c where c.id = v_outubro.id),
     jsonb_build_object('fonte', 'Print Preview 2.pdf', 'data_posicao', '2026-10-30',
                        'recibo', '2670161', 'valor_anterior', 546.54, 'valor_novo', 544.57));
end
$conciliacao$;
