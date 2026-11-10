begin;

-- Autorizações administrativas pontuais: sem concessão aos clientes e sem mudar o cron.
create table public.email_excecoes_teste (
 mensagem_id uuid primary key references public.mensagens(id),
 carteira_id uuid not null references public.carteiras(id),
 condominio_id uuid not null references public.condominios(id),
 flow_id uuid not null references public.cobranca_flows(id),
 assinatura text not null,
 motivo text not null,
 criado_em timestamptz not null default now(),
 expira_em timestamptz not null,
 revogado_em timestamptz,
 check (expira_em > criado_em and expira_em <= criado_em + interval '1 hour')
);
alter table public.email_excecoes_teste enable row level security;
revoke all on public.email_excecoes_teste from public,anon,authenticated;
grant select,insert,update on public.email_excecoes_teste to service_role;

create function public.email_assinatura_teste(m public.mensagens)
returns text language sql immutable set search_path='' as $$
 select md5(jsonb_build_array(m.carteira_id,m.cobranca_id,m.cobranca_flow_id,
 m.acordo_id,m.acordo_flow_id,m.pre_juridico_flow_id,m.destinatario,
 m.email_assunto,m.template_id,m.conteudo,m.conteudo_renderizado,m.payload)::text);
$$;

create function public.email_excecao_teste_autorizada(m public.mensagens)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
 select 1 from public.email_excecoes_teste e
 join public.cobrancas c on c.id=m.cobranca_id
 join public.condominios co on co.id=c.condominio_id
 where e.mensagem_id=m.id and e.carteira_id=m.carteira_id
 and c.carteira_id=e.carteira_id and co.carteira_id=e.carteira_id
 and e.condominio_id=c.condominio_id and e.flow_id=m.cobranca_flow_id
 and e.assinatura=public.email_assinatura_teste(m)
 and e.revogado_em is null and e.expira_em>now()
 and m.canal='email' and m.status='agendada'
 and m.acordo_flow_id is null and m.pre_juridico_flow_id is null
 );
$$;
revoke all on function public.email_assinatura_teste(public.mensagens),public.email_excecao_teste_autorizada(public.mensagens) from public,anon,authenticated;
grant execute on function public.email_assinatura_teste(public.mensagens),public.email_excecao_teste_autorizada(public.mensagens) to service_role;

do $migration$
declare src text; anchor text := 'public.email_aviso_interno_autorizado(m) is not true';
begin
 src := pg_get_functiondef('public.email_reservar_disparo_interno(uuid,text)'::regprocedure);
 if (length(src)-length(replace(src,anchor,'')))/length(anchor) <> 3 then
  raise exception 'Reserva SMTP mudou: conferir as três condições de janela/intervalo.';
 end if;
 -- Mantém elegibilidade, estado, duplicidade, reservas, cota diária e transporte originais.
 execute replace(src,anchor,'(public.email_aviso_interno_autorizado(m) is not true and public.email_excecao_teste_autorizada(m) is not true)');
end $migration$;
notify pgrst,'reload schema';
commit;
