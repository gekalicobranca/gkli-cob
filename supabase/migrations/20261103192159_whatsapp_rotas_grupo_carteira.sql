begin;
create table public.whatsapp_web_rotas_grupo (
  carteira_id uuid not null references public.carteiras(id),
  grupo text not null check (grupo=upper(btrim(grupo)) and grupo<>''),
  sessao text not null unique check (sessao ~ '^[a-zA-Z0-9_-]{1,60}$'),
  numero text not null check (numero ~ '^55[1-9][0-9]{9,10}$'),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(carteira_id,grupo)
);
alter table public.whatsapp_web_rotas_grupo enable row level security;
revoke all on public.whatsapp_web_rotas_grupo from public,anon,authenticated;
grant select,insert,update,delete on public.whatsapp_web_rotas_grupo to service_role;

-- O cadastro financeiro e o grupo atual do condomínio são a fonte da rota.
-- Não usar nomes de grupo, sessão ou número recebidos no payload da mensagem.
create or replace function public.whatsapp_web_rota_mensagem(p_mensagem uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('carteira_id',m.carteira_id,'transporte',ca.whatsapp_transporte,
   'sessao',coalesce(r.sessao,ca.whatsapp_web_sessao),
   'numero',coalesce(r.numero,ca.whatsapp_web_numero))
 from public.mensagens m join public.carteiras ca on ca.id=m.carteira_id
 left join public.cobrancas cb on cb.id=m.cobranca_id
 left join public.acordos a on a.id=m.acordo_id
 left join public.condominios co on co.id=coalesce(cb.condominio_id,a.condominio_id)
 left join public.whatsapp_web_rotas_grupo r on r.carteira_id=ca.id and r.grupo=upper(btrim(co.grupo))
 where m.id=p_mensagem
   and (cb.id is null or cb.carteira_id=ca.id)
   and (a.id is null or a.carteira_id=ca.id)
   and (co.id is null or co.carteira_id=ca.id)
   and (cb.id is null or a.id is null or cb.condominio_id=a.condominio_id)
   and (r.sessao is null or r.ativo);
$$;
revoke all on function public.whatsapp_web_rota_mensagem(uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_web_rota_mensagem(uuid) to service_role;

-- Troca só o filtro de remetente; preserva quota física móvel, pausas,
-- prioridade sem e-mail, horário, cadência e retenção dos envios incertos.
do $patch$
declare
 definition text:=replace(pg_get_functiondef('public.whatsapp_web_reservar(text,text)'::regprocedure),chr(13),'');
 old_filter text:=$old$join carteiras c on c.id=msg.carteira_id
    where c.whatsapp_transporte='web' and c.whatsapp_web_sessao=p_sessao and c.whatsapp_web_numero=p_numero$old$;
 new_filter text:=$new$join carteiras c on c.id=msg.carteira_id
    join lateral jsonb_to_record(public.whatsapp_web_rota_mensagem(msg.id))
      as rota(transporte text,sessao text,numero text) on true
    where rota.transporte='web' and rota.sessao=p_sessao and rota.numero=p_numero$new$;
 old_guard text:=$old$if not public.flow_cobranca_mensagem_elegivel(m) then$old$;
 new_guard text:=$new$if not exists(select 1 from jsonb_to_record(public.whatsapp_web_rota_mensagem(m.id))
   as rota(transporte text,sessao text,numero text)
   where rota.transporte='web' and rota.sessao=p_sessao and rota.numero=p_numero) then return null; end if;
 if not public.flow_cobranca_mensagem_elegivel(m) then$new$;
begin
 if position(new_filter in definition)>0 then return; end if;
 if position(old_filter in definition)=0 or position(old_guard in definition)=0
   or position('24 hours' in definition)=0 or position('>= 20' in definition)=0 then
   raise exception 'Reserva WhatsApp mudou: revisar filtro e limite antes de aplicar';
 end if;
 execute replace(replace(definition,old_filter,new_filter),old_guard,new_guard);
end $patch$;

-- Mantém o template GEKALI, trocando apenas o contato da assinatura na cópia
-- da mensagem. Não modifica templates compartilhados nem histórico enviado.
create or replace function public.whatsapp_web_assinatura_grupo()
returns trigger language plpgsql security invoker set search_path='' as $$
declare destino text; padrao text; origem text; nova_formatada text; antiga_formatada text; padrao_formatado text; rota boolean;
begin
 if new.canal<>'whatsapp' or new.status in('enviada','cancelada') then return new; end if;
 select coalesce(r.numero,ca.whatsapp_web_numero),ca.whatsapp_web_numero,r.sessao is not null
 into destino,padrao,rota
 from public.carteiras ca
 left join public.cobrancas cb on cb.id=new.cobranca_id and cb.carteira_id=ca.id
 left join public.acordos a on a.id=new.acordo_id and a.carteira_id=ca.id
 left join public.condominios co on co.id=coalesce(cb.condominio_id,a.condominio_id) and co.carteira_id=ca.id
 left join public.whatsapp_web_rotas_grupo r on r.carteira_id=ca.id and r.grupo=upper(btrim(co.grupo)) and r.ativo
 where ca.id=new.carteira_id and ca.whatsapp_transporte='web';
 if destino is null or (not coalesce(rota,false) and not (coalesce(new.payload,'{}') ? 'whatsapp_assinatura_rota')) then return new; end if;
 origem:=coalesce(new.payload#>>'{whatsapp_assinatura_rota,numero}',padrao);
 nova_formatada:=regexp_replace(destino,'^55([0-9]{2})([0-9]{4,5})([0-9]{4})$','\1 \2-\3');
 antiga_formatada:=regexp_replace(origem,'^55([0-9]{2})([0-9]{4,5})([0-9]{4})$','\1 \2-\3');
 padrao_formatado:=regexp_replace(padrao,'^55([0-9]{2})([0-9]{4,5})([0-9]{4})$','\1 \2-\3');
 new.conteudo:=replace(replace(new.conteudo,antiga_formatada,nova_formatada),padrao_formatado,nova_formatada);
 new.conteudo_renderizado:=replace(replace(new.conteudo_renderizado,antiga_formatada,nova_formatada),padrao_formatado,nova_formatada);
 if new.payload#>>'{template_resolvido,conteudo}' is not null then
  new.payload:=jsonb_set(new.payload,'{template_resolvido,conteudo}',to_jsonb(replace(replace(new.payload#>>'{template_resolvido,conteudo}',antiga_formatada,nova_formatada),padrao_formatado,nova_formatada)));
 end if;
 if new.payload#>>'{template_resolvido,renderizado}' is not null then
  new.payload:=jsonb_set(new.payload,'{template_resolvido,renderizado}',to_jsonb(replace(replace(new.payload#>>'{template_resolvido,renderizado}',antiga_formatada,nova_formatada),padrao_formatado,nova_formatada)));
 end if;
 new.payload:=coalesce(new.payload,'{}')||jsonb_build_object('whatsapp_assinatura_rota',jsonb_build_object('numero',destino,'numero_padrao',padrao));
 return new;
end $$;
revoke all on function public.whatsapp_web_assinatura_grupo() from public,anon,authenticated;
grant execute on function public.whatsapp_web_assinatura_grupo() to service_role;
create trigger whatsapp_assinatura_grupo before insert or update of conteudo,conteudo_renderizado,payload,carteira_id,cobranca_id,acordo_id
on public.mensagens for each row execute function public.whatsapp_web_assinatura_grupo();
commit;
