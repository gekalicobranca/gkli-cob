-- Revalida também condomínio, identificação e bloco antes de registrar confirmação.
create or replace function public.scanner_saldos_registrar(p_token uuid,p_unidade uuid,p_resultado jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$
declare c public.scanner_controle;snapshot jsonb;atual jsonb;itens jsonb;resultado text;n integer;id_salvo uuid;
begin
 select id into id_salvo from public.scanner_saldos_conferencias where token=p_token and unidade_id=p_unidade;
 if found then return jsonb_build_object('id',id_salvo,'reutilizado',true);end if;
 select * into c from public.scanner_controle where id for update;
 if c.token is distinct from p_token or c.reservado_ate<=now() then raise exception 'Reserva expirada';end if;
 select value into snapshot from public.scanner_saldos_lotes l,jsonb_array_elements(l.alvos) where l.token=p_token and l.concluido_em is null and value->>'unidade_id'=p_unidade::text;
 if not found then raise exception 'Unidade fora do lote';end if;
 perform 1 from public.unidades where id=p_unidade for update;
 perform 1 from public.cobrancas where unidade_id=p_unidade for share;
 itens:=p_resultado->'itens';
 if jsonb_typeof(itens) is distinct from 'array' or jsonb_array_length(itens)<>jsonb_array_length(snapshot->'cobrancas')
 or exists(select 1 from jsonb_array_elements(itens) i where not exists(select 1 from jsonb_array_elements(snapshot->'cobrancas') b where b->>'id'=i->>'id') or coalesce(i->>'situacao','') not in ('confirmada_em_aberto','nao_confirmada'))
 or (select count(distinct value->>'id') from jsonb_array_elements(itens))<>jsonb_array_length(itens) then raise exception 'Itens fora do escopo';end if;
 select to_jsonb(a) into atual from public.scanner_saldos_alvos()a where a.unidade_id=p_unidade;
 if atual is null or atual->>'condominio_id' is distinct from snapshot->>'condominio_id'
 or atual->>'identificacao' is distinct from snapshot->>'identificacao'
 or atual->'bloco' is distinct from snapshot->'bloco'
 or atual->'cobrancas' is distinct from snapshot->'cobrancas' or atual->>'carteira_id' is distinct from snapshot->>'carteira_id' then
  resultado:='elegibilidade_alterada';
  select jsonb_agg(value||jsonb_build_object('situacao','nao_confirmada','motivo','Elegibilidade alterada após a reserva')) into itens from jsonb_array_elements(itens);
 else
  select count(*) into n from jsonb_array_elements(itens) i where i->>'situacao'='confirmada_em_aberto';
  resultado:=case when n=jsonb_array_length(itens) then 'confirmada_em_aberto' when n>0 then 'parcial' else 'nao_confirmada' end;
 end if;
 if exists(select 1 from jsonb_array_elements(itens) i where i->>'situacao'='confirmada_em_aberto')
 and (coalesce(p_resultado->>'sha256','')!~'^[0-9a-f]{64}$' or nullif(p_resultado->>'fonte','') is null) then raise exception 'Confirmação sem evidência';end if;
 if exists(select 1 from jsonb_array_elements(itens)i where i->>'situacao'='confirmada_em_aberto'
 and (coalesce(i->>'recibo_portal','')!~'^[0-9]+$' or coalesce(i->>'principal_portal_centavos','')!~'^[0-9]+$' or coalesce(i->>'saldo_portal_centavos','')!~'^[0-9]+$')) then raise exception 'Confirmação sem valores e recibo';end if;
 insert into public.scanner_saldos_conferencias(token,unidade_id,condominio_id,carteira_id,resultado,cobrancas_app,itens,fonte,sha256,motivo,extras_ignorados)
 values(p_token,p_unidade,(snapshot->>'condominio_id')::uuid,(snapshot->>'carteira_id')::uuid,resultado,snapshot->'cobrancas',itens,
 left(p_resultado->>'fonte',1000),p_resultado->>'sha256',left(p_resultado->>'motivo',500),greatest(0,coalesce((p_resultado->>'extras_ignorados')::integer,0))) returning id into id_salvo;
 update public.scanner_saldos_fila set reservado_token=null,conferido_em=now(),ultimo_resultado=resultado,proxima_execucao=now()+case when resultado='elegibilidade_alterada' then interval '30 minutes' else interval '24 hours' end where unidade_id=p_unidade;
 return jsonb_build_object('id',id_salvo,'resultado',resultado);
end $$;
