begin;

do $migration$
declare
  definicao text := pg_get_functiondef('public.easy_espelhamento_concluir(uuid,integer,text,jsonb)'::regprocedure);
  baixa_antiga constant text := $trecho$update public.cobrancas set status=case when unidade.acao_judicial then 'judicializado' else 'quitado' end,
            status_operacional=case when unidade.acao_judicial then 'judicializado' else 'quitado' end,
            status_financeiro='quitado'$trecho$;
  guarda_antiga constant text := $trecho$if exists(select 1 from public.cobrancas c where c.condominio_id=condominio.id and c.unidade_id=unidade.id and c.vencimento=data_vencimento_portal
              and (public.cobranca_recibo_arquivo(c.observacoes) is null or public.cobranca_recibo_arquivo(c.observacoes)=item->>'recibo')) then$trecho$;
  guarda_nova constant text := $trecho$if exists(
              select 1 from public.cobrancas c
              cross join lateral (values (coalesce(
                public.cobranca_recibo_arquivo(c.observacoes),
                case when p_codigo ~ '^[0-9]+$' then
                  (regexp_match(c.observacoes, '^Recibo[[:space:]]+Lello[[:space:]]+([0-9]{6,})(?:[[:space:]]|$)', 'i'))[1]
                end
              ))) as r(recibo)
              where c.condominio_id=condominio.id and c.unidade_id=unidade.id and c.vencimento=data_vencimento_portal
                and (r.recibo is null or r.recibo=item->>'recibo')
            ) then$trecho$;
begin
  if strpos(definicao, baixa_antiga) = 0 or strpos(definicao, guarda_antiga) = 0 then
    raise exception 'Definição do Espelhar mudou; revise as regras de baixa e identidade do recibo.';
  end if;

  definicao := replace(definicao, baixa_antiga, 'update public.cobrancas set status_financeiro=''quitado''');
  -- Recibos diferentes da Lello podem ter o mesmo vencimento, como cota mensal e água.
  execute replace(definicao, guarda_antiga, guarda_nova);
end;
$migration$;

commit;
