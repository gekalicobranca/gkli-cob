import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'
import {evidencia} from './core.mjs'

export async function fixture({bbzVinculos=false}={}){
 const db=new PGlite()
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create table test_clock(value timestamptz);insert into test_clock values('2026-10-25 04:00Z');
 create function test_now() returns timestamptz language sql as 'select value from test_clock';
 create function current_user_is_admin() returns boolean language sql as 'select false';
 create function cobranca_recibo_arquivo(obs text) returns text language sql immutable as $$select substring(obs from 'Recibo ([0-9]+)')$$;
 create table condominios(id uuid primary key,carteira_id uuid,status text,administradora text);
 create table unidades(id uuid primary key,condominio_id uuid,carteira_id uuid,identificacao text,bloco text);
 create table acordos(id uuid primary key,condominio_id uuid,carteira_id uuid,unidade_id uuid);
 create table cobrancas(id uuid primary key,condominio_id uuid,carteira_id uuid,unidade_id uuid,valor_original numeric,valor_atualizado numeric,vencimento date,status text,observacoes text,duplicada_de_id uuid,updated_at timestamptz default test_now());
 create table parcelas_acordo(id uuid primary key,acordo_id uuid,numero int,valor numeric,vencimento date,status text,data_pagamento date,observacoes text,updated_at timestamptz default test_now());
 create table acordos_fontes_lello(codigo_condominio text,numero_acordo text,acordo_id uuid,condominio_id uuid,carteira_id uuid,unidade_id uuid,fonte_json jsonb);
 create table lello_vinculos_safira(acordo_id uuid,acordo_externo text,unidade_externa text,revogado_em timestamptz);
 grant all on all tables in schema public to service_role;`)
 await db.exec((await readFile(new URL('../../supabase/migrations/20261020121015_scanner_enriquecimento_noturno.sql',import.meta.url),'utf8')).replaceAll('now()','public.test_now()'))
 await db.exec("alter table scanner_configuracoes add portal text not null default 'lello'")
 await db.exec((await readFile(new URL('../../supabase/migrations/20261025030047_scanner_conciliacao_pagamentos.sql',import.meta.url),'utf8')).replaceAll('now()','public.test_now()'))
 await db.exec((await readFile(new URL('../../supabase/migrations/20261025031246_scanner_bbz_financeiro_lotes20.sql',import.meta.url),'utf8')).replaceAll('now()','public.test_now()'))
 if(bbzVinculos){await db.exec("create function cobranca_recibo_identidade(obs text) returns text language sql immutable as 'select null::text';revoke all on function cobranca_recibo_arquivo(text) from public,authenticated;");await db.exec(await readFile(new URL('../../supabase/migrations/20261025032628_scanner_executor_recibo_helpers.sql',import.meta.url),'utf8'));await db.exec("alter table acordos add observacoes text,add quantidade_parcelas integer,add valor_acordado numeric;create table agente_acordos_configuracoes(condominio_id uuid primary key,codigo_cliente text,administradora text);grant all on agente_acordos_configuracoes to service_role;");await db.exec((await readFile(new URL('../../supabase/migrations/20261025032546_scanner_bbz_vinculos_recibos.sql',import.meta.url),'utf8')).replaceAll('now()','public.test_now()'))}
 const ids=Object.fromEntries(['condo','car','unit','acordo','parcela','cobranca','config'].map(k=>[k,randomUUID()]))
 await db.query("insert into condominios values($1,$2,'ativo','Lello')",[ids.condo,ids.car])
 await db.query("insert into unidades values($1,$2,$3,'000001','0')",[ids.unit,ids.condo,ids.car])
 await db.query('insert into acordos(id,condominio_id,carteira_id,unidade_id) values($1,$2,$3,$4)',[ids.acordo,ids.condo,ids.car,ids.unit])
 await db.query("insert into cobrancas(id,condominio_id,carteira_id,unidade_id,valor_original,valor_atualizado,vencimento,status,observacoes) values($1,$2,$3,$4,100,100,'2026-10-10','em_aberto','Recibo 999999')",[ids.cobranca,ids.condo,ids.car,ids.unit])
 await db.query("insert into parcelas_acordo(id,acordo_id,numero,valor,vencimento,status) values($1,$2,1,100,'2026-10-10','aberta')",[ids.parcela,ids.acordo])
 await db.query("insert into acordos_fontes_lello values('63004','123',$1,$2,$3,$4,$5)",[ids.acordo,ids.condo,ids.car,ids.unit,JSON.stringify({unidade:'000001'})])
 await db.query("insert into scanner_configuracoes(id,condominio_id,codigo_portal,perfil_acesso,unidades,ativo) values($1,$2,'63004','PADRAO',array['000001'],true)",[ids.config,ids.condo])
 const app=async()=>JSON.stringify((await db.query('select (select jsonb_agg(to_jsonb(b) order by id) from cobrancas b) cobrancas,(select jsonb_agg(to_jsonb(p) order by id) from parcelas_acordo p) parcelas')).rows)
 async function prova(dados,unidade='000001'){
  await db.exec("update test_clock set value=value+interval '1 second'")
  const id=randomUUID(),ev=evidencia(unidade,'pagamentos',dados)
  const salvo=await db.query("insert into scanner_evidencias(id,configuracao_id,unidade_portal,tipo,dados,sha256) values($1,$2,$3,'pagamentos',$4,$5) on conflict(configuracao_id,unidade_portal,tipo,sha256) do update set observado_em=test_now(),conciliacao_status='pendente' returning id",[id,ids.config,unidade,JSON.stringify(dados),ev.sha256])
  return salvo.rows[0].id
 }
 async function aplicar(id){
  const antes=await app(),r=(await db.query('select scanner_conciliar_pagamentos($1) r',[id])).rows[0].r
  assert.equal(await app(),antes,'nenhuma baixa ou alteração financeira')
  const auditoria=(await db.query('select * from scanner_conciliacao_auditoria where evidencia_id=$1 order by observado_em desc',[id])).rows[0]
  return {r,auditoria,itens:auditoria?.itens??[]}
 }
 await db.exec('set role service_role')
 return {db,ids,prova,aplicar}
}
