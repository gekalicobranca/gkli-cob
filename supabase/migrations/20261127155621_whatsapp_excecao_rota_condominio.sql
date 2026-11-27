begin;
-- This exception uses only the condominium's own wallet default line.
-- It cannot specify another wallet, session or phone number.
create table public.whatsapp_web_excecoes_grupo (
  condominio_id uuid primary key references public.condominios(id),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.whatsapp_web_excecoes_grupo is
  'Exceção por condomínio para usar a linha padrão da própria carteira em vez da rota de grupo. Alterações exigem revisão de carteira e auditoria.';
alter table public.whatsapp_web_excecoes_grupo enable row level security;
revoke all on public.whatsapp_web_excecoes_grupo from public,anon,authenticated;
grant select,insert,update,delete on public.whatsapp_web_excecoes_grupo to service_role;

create or replace function public.whatsapp_web_rota_mensagem(p_mensagem uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('carteira_id',m.carteira_id,'transporte',ca.whatsapp_transporte,
   'sessao',case when x.ativo then ca.whatsapp_web_sessao else coalesce(r.sessao,ca.whatsapp_web_sessao) end,
   'numero',case when x.ativo then ca.whatsapp_web_numero else coalesce(r.numero,ca.whatsapp_web_numero) end)
 from public.mensagens m join public.carteiras ca on ca.id=m.carteira_id
 left join public.cobrancas cb on cb.id=m.cobranca_id
 left join public.acordos a on a.id=m.acordo_id
 left join public.condominios co on co.id=coalesce(cb.condominio_id,a.condominio_id)
 left join public.whatsapp_web_rotas_grupo r on r.carteira_id=ca.id and r.grupo=upper(btrim(co.grupo))
 left join public.whatsapp_web_excecoes_grupo x on x.condominio_id=co.id
 where m.id=p_mensagem
   and (cb.id is null or cb.carteira_id=ca.id)
   and (a.id is null or a.carteira_id=ca.id)
   and (co.id is null or co.carteira_id=ca.id)
   and (cb.id is null or a.id is null or cb.condominio_id=a.condominio_id)
   and (x.ativo is true or r.sessao is null or r.ativo);
$$;
revoke all on function public.whatsapp_web_rota_mensagem(uuid) from public,anon,authenticated;
grant execute on function public.whatsapp_web_rota_mensagem(uuid) to service_role;
-- Keep signatures aligned with the same exception, including if a group route
-- is enabled later. The existing trigger still skips sent/cancelled messages.
do $patch$
declare
  definition text:=pg_get_functiondef('public.whatsapp_web_assinatura_grupo()'::regprocedure);
  needle text:='left join public.whatsapp_web_rotas_grupo r on r.carteira_id=ca.id and r.grupo=upper(btrim(co.grupo)) and r.ativo';
begin
  if position(needle in definition)=0 then raise exception 'Assinatura WhatsApp mudou; revisar compatibilidade.'; end if;
  execute replace(definition,needle,needle||' and not exists(select 1 from public.whatsapp_web_excecoes_grupo x where x.condominio_id=co.id and x.ativo)');
end $patch$;
notify pgrst,'reload schema';
commit;
