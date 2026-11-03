begin;
-- Reconfere também o estado atual da unidade, além dos identificadores do
-- acordo e da evidência, caso o cadastro tenha sido transferido de carteira.
do $$declare src text;ancora text:='join public.scanner_evidencias e on';begin
 src:=pg_get_functiondef('public.scanner_relatorio_judicial_permitido(uuid,uuid,uuid,uuid)'::regprocedure);
 if position(ancora in src)=0 or position('join public.unidades u on' in src)>0 then raise exception 'Escopo judicial mudou; revisar migração.';end if;
 execute replace(src,ancora,'join public.unidades u on u.id=a.unidade_id and u.condominio_id=c.id and u.carteira_id=c.carteira_id '||ancora);
end $$;
notify pgrst,'reload schema';
commit;
