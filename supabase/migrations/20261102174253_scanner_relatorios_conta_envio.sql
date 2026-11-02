begin;
-- Somente relatórios selados usam a conta explícita do scanner. As preferências
-- e rotas existentes de cobranças, acordos e agentes virtuais são preservadas.
do $$
declare src text;ancora text:='select * into strict m from public.mensagens where id=p_mensagem;';bloco text;
begin
 src:=pg_get_functiondef('public.email_smtp_candidatas(uuid)'::regprocedure);
 if position(ancora in src)=0 then raise exception 'Âncora SMTP não encontrada; revisar antes de alterar rotas.';end if;
 bloco:=$body$
 if public.scanner_relatorio_email_autorizado(m) then
  return query select s.id,lower(trim(s.usuario)),s.prioridade from public.integracoes_smtp_config s
   where s.carteira_id=m.carteira_id and s.ativo and lower(trim(s.usuario))='cobranca@gekali.com.br';
  if not found then raise exception 'Conta de relatório indisponível.';end if;
  return;
 end if;
 $body$;
 execute replace(src,ancora,ancora||bloco);
end $$;
notify pgrst,'reload schema';
commit;
