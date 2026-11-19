do $$
declare
  definicao text := pg_get_functiondef('public.easy_espelhamento_concluir(uuid,integer,text,jsonb)'::regprocedure);
  marcador text := $s$            alvo := cota.id;
            antes := jsonb_build_object('status',cota.status,'principal',cota.valor_original,'total',cota.valor_atualizado);$s$;
  observacao text := $s$observacoes=case when public.cobranca_recibo_arquivo(cota.observacoes) is not null then cota.observacoes else concat_ws(E'\n','Recibo: '||(item->>'recibo'),cota.observacoes) end$s$;
begin
  if strpos(definicao, marcador)=0 or strpos(definicao, observacao)=0 then
    raise exception 'A gravação das cotas do Easy Espelhar mudou.';
  end if;

  definicao := replace(definicao, marcador, $s$
            if item->>'chaveLegada' is not null then
              if p_codigo !~ '^[0-9]+$' or coalesce(item->>'recibo','') !~ '^[0-9]{6,}$'
                or item->>'chaveLegada' is distinct from ('LELLO-'||p_codigo||'-'||(item->>'unidade')||'-'||to_char(cota.vencimento,'YYYYMMDD'))
                or public.cobranca_recibo_arquivo(cota.observacoes) is distinct from item->>'chaveLegada'
                or cota.observacoes !~* '^((Conversão de relatório - recibo )|(Origem: Conversão de Relatório \| Sistema: Lello Condomínios \| Recibo: ))LELLO-'
                or round(cota.valor_original*100) is distinct from (item->>'principal')::numeric then
                raise exception 'A identidade da cota importada da Lello mudou.';
              end if;
            end if;
$s$ || marcador);
  definicao := replace(definicao, observacao, $s$observacoes=case
                when item->>'chaveLegada' is not null or public.cobranca_recibo_arquivo(cota.observacoes) is null
                then concat_ws(E'\n','Recibo: '||(item->>'recibo'),cota.observacoes)
                else cota.observacoes end$s$);
  execute definicao;
end;
$$;
