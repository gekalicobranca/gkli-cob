import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {fixture} from './conciliacao-fixture.mjs'

export async function banco({manual=false}={}){
 const f=await fixture({bbzVinculos:true}),{db,ids}=f
 await db.exec(`reset role;
 alter table unidades add acao_judicial boolean default false;
 alter table acordos add cobranca_id uuid,add status text default 'ativo',add tipo text default 'extrajudicial',add status_financeiro text default 'em_aberto',add possui_entrada boolean default false,add valor_entrada numeric default 0,add data_quitacao date;
 alter table parcelas_acordo add tipo_parcela text default 'parcela';
 alter table cobrancas add status_financeiro text default 'em_aberto',add status_operacional text default 'novo',add automacao_bloqueada boolean default false;
 create table acordo_cobrancas(acordo_id uuid,cobranca_id uuid);
 create table central_pendencias(id uuid primary key default gen_random_uuid(),carteira_id uuid,condominio_id uuid,unidade_id uuid,status text,payload jsonb);
 create table auditoria_eventos(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,descricao text,usuario_id uuid,usuario_nome text,antes jsonb,depois jsonb);
 create table timeline_operacional(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,descricao text,severidade text,condominio_id uuid,unidade_id uuid,cobranca_id uuid,acordo_id uuid,origem text,usuario_id uuid,usuario_nome text,payload jsonb);
 create table mensagens(id uuid primary key default gen_random_uuid(),carteira_id uuid,cobranca_id uuid,status text,payload jsonb);
 create function flow_cancelar_mensagem(mid uuid) returns void language sql as $$update mensagens set status='cancelada' where id=mid and status in ('agendada','aprovada')$$;
 create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at:=public.test_now();return new;end$$;
 create trigger updated before update on parcelas_acordo for each row execute function set_updated_at();
 create trigger updated before update on cobrancas for each row execute function set_updated_at();
 grant all on all tables in schema public to service_role;`)
 await db.exec((await readFile(new URL('../../supabase/migrations/20261025132645_scanner_baixa_auditada_pagamentos.sql',import.meta.url),'utf8')).replaceAll('now()','public.test_now()'))
 await db.exec(await readFile(new URL('../../supabase/migrations/20261025132800_scanner_baixas_historico_append.sql',import.meta.url),'utf8'))
 if(manual)await db.exec((await readFile(new URL('../../supabase/migrations/20261025200042_scanner_lote_manual_limitado.sql',import.meta.url),'utf8')).replaceAll('now()','public.test_now()'))
 await db.query("update acordos set quantidade_parcelas=1,valor_acordado=100,observacoes='[BBZ:01380:12345678]'")
 await db.query("update scanner_configuracoes set portal='manager',codigo_portal='567',unidades=array[$1]",[ids.unit])
 await db.exec('set role service_role')
 const fonte=pagamentos=>({codigo:'567',unidade:ids.unit,referencia_portal:'0/AP/000001',fonte:'https://atentum-s9.webware.com.br/bin/rt/gExtratoUnidade.asp',status:'consultado',pagamentos})
 const prova=async pagamentos=>f.prova(fonte(pagamentos),ids.unit)
 const execucao=randomUUID()
 const processar=async id=>(await db.query('select scanner_processar_pagamentos($1,$2) r',[id,execucao])).rows[0].r
 return {...f,prova,provaBruta:f.prova,processar,execucao}
}
