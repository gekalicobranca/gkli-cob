begin;

-- Só o backend pode registrar autorização humana pontual; não altera a janela padrão.
create table public.email_liberacoes_imediatas (
 mensagem_id uuid primary key references public.mensagens(id),
 carteira_id uuid not null references public.carteiras(id),
 condominio_id uuid not null references public.condominios(id),
 flow_id uuid not null references public.cobranca_flows(id),
 assinatura text not null,
 motivo text not null check(length(trim(motivo))>=12),
 criado_em timestamptz not null default now(),
 expira_em timestamptz not null,
 revogado_em timestamptz,
 check(expira_em>criado_em and expira_em<=criado_em+interval '3 hours')
);
alter table public.email_liberacoes_imediatas enable row level security;
revoke all on public.email_liberacoes_imediatas from public,anon,authenticated;
grant select,insert,update on public.email_liberacoes_imediatas to service_role;

create function public.email_assinatura_envio_manual(m public.mensagens)
returns text language sql immutable set search_path='' as $$
 select md5(jsonb_build_array(m.carteira_id,m.cobranca_id,m.cobranca_flow_id,
 m.acordo_id,m.acordo_flow_id,m.pre_juridico_flow_id,m.destinatario,
 m.email_assunto,m.template_id,m.conteudo,m.conteudo_renderizado,m.payload)::text);
$$;

create function public.email_liberacao_imediata_autorizada(m public.mensagens,p_at timestamptz default now())
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(
 select 1 from public.email_liberacoes_imediatas e
 join public.cobrancas c on c.id=m.cobranca_id
 join public.condominios co on co.id=c.condominio_id
 where e.mensagem_id=m.id and e.carteira_id=m.carteira_id
 and c.carteira_id=e.carteira_id and co.carteira_id=e.carteira_id
 and e.condominio_id=c.condominio_id and e.flow_id=m.cobranca_flow_id
 and e.assinatura=public.email_assinatura_envio_manual(m)
 and e.revogado_em is null and e.criado_em<=p_at and e.expira_em>p_at and e.expira_em>now()
 and m.canal='email' and m.status='agendada'
 and m.acordo_flow_id is null and m.pre_juridico_flow_id is null
 );
$$;
revoke all on function public.email_assinatura_envio_manual(public.mensagens),public.email_liberacao_imediata_autorizada(public.mensagens,timestamptz) from public,anon,authenticated;
grant execute on function public.email_assinatura_envio_manual(public.mensagens),public.email_liberacao_imediata_autorizada(public.mensagens,timestamptz) to service_role;

-- Modificações limitadas às verificações de janela; demais travas permanecem nativas.
do $migration$
declare src text; anchor text; replacement text;
begin
 src:=pg_get_functiondef('public.email_reservar_horario(uuid,text,timestamptz)'::regprocedure);
 anchor:='v_at:=public.email_proximo_horario_noturno(to_timestamp(ceil(extract(epoch from v_at)/600)*600));';
 if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 then raise exception 'Agenda de e-mail mudou: revisar liberação pontual.'; end if;
 replacement:='if public.email_liberacao_imediata_autorizada(m,v_at) is not true then '||anchor||' end if;';
 execute replace(src,anchor,replacement);

 src:=pg_get_functiondef('public.email_reservar_disparo_interno(uuid,text)'::regprocedure);
 anchor:='not public.email_janela_noturna(v_now) and';
 if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>2 then raise exception 'Reserva de e-mail mudou: revisar as duas travas de janela.'; end if;
 execute replace(src,anchor,anchor||' public.email_liberacao_imediata_autorizada(m) is not true and');

 src:=pg_get_functiondef('public.thunderbird_reservar(uuid,boolean)'::regprocedure);
 anchor:='if not public.email_janela_noturna(clock_timestamp()) then return null; end if;';
 if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 then raise exception 'Reserva Thunderbird mudou.'; end if;
 replacement:=$new$if not public.email_janela_noturna(clock_timestamp()) and not exists(
  select 1 from public.mensagens x join public.email_agenda a on a.mensagem_id=x.id
  where x.carteira_id=d.carteira_id and x.status='agendada' and a.agendada_para<=now()
  and public.email_liberacao_imediata_autorizada(x)) then return null; end if;$new$;
 execute replace(src,anchor,replacement);

 src:=pg_get_functiondef('public.thunderbird_iniciar(uuid,uuid)'::regprocedure);
 anchor:='if not public.email_janela_noturna(clock_timestamp()) then return false; end if;';
 if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 then raise exception 'Autorização final Thunderbird mudou.'; end if;
 src:=replace(src,anchor,'');
 anchor:='select * into strict m from mensagens where id=e.mensagem_id for update;';
 if (length(src)-length(replace(src,anchor,'')))/length(anchor)<>1 then raise exception 'Mensagem final Thunderbird mudou.'; end if;
 execute replace(src,anchor,anchor||E'\n  if not public.email_janela_noturna(clock_timestamp()) and public.email_liberacao_imediata_autorizada(m) is not true then return false; end if;');
end $migration$;
notify pgrst,'reload schema';
commit;
