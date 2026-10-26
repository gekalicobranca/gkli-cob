import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db=new PGlite()
await db.exec(`create role anon; create role authenticated; create role service_role;
create table mensagens(id uuid,carteira_id uuid,acordo_id uuid,acordo_flow_id uuid,regua_etapa_id uuid,payload jsonb);
create table acordos(id uuid,status text,status_financeiro text,carteira_id uuid,observacoes text);
create table parcelas_acordo(id uuid,acordo_id uuid,status text,data_pagamento date,vencimento date);
create table regua_etapas(id uuid,delay_dias int,ativo boolean);
create function mensagem_contem_cobranca_arquivada(m mensagens) returns boolean language sql as 'select false';
create function flow_cobranca_mensagem_elegivel(m mensagens) returns boolean language sql as 'select not public.mensagem_contem_cobranca_arquivada(m)';`)
await db.exec(readFileSync('supabase/migrations/20261025025022_acordos_regua_baixa_pagamento_d5.sql','utf8'))
const id=(n:number)=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0')
await db.exec(`insert into acordos values('${id(1)}','ativo','em_aberto','${id(2)}',null); insert into parcelas_acordo values('${id(3)}','${id(1)}','vencida',null,(now() at time zone 'America/Sao_Paulo')::date-5);insert into regua_etapas values('${id(4)}',5,true);insert into mensagens values('${id(5)}','${id(2)}','${id(1)}','${id(6)}','${id(4)}','{"parcela_id":"${id(3)}"}');`)
async function eligible(){return (await db.query<{ok:boolean}>('select flow_cobranca_mensagem_elegivel(m) ok from mensagens m')).rows[0].ok}
assert.equal(await eligible(),true)
await db.exec(`update parcelas_acordo set data_pagamento=current_date`);assert.equal(await eligible(),false)
await db.exec(`update parcelas_acordo set data_pagamento=null,status='paga'`);assert.equal(await eligible(),false)
await db.exec(`update parcelas_acordo set status='vencida',vencimento=(now() at time zone 'America/Sao_Paulo')::date-2`);assert.equal(await eligible(),false)
await db.exec(`update parcelas_acordo set vencimento=(now() at time zone 'America/Sao_Paulo')::date-5; update acordos set status='quebrado'`);assert.equal(await eligible(),false)
await db.exec(`update acordos set status='ativo';update regua_etapas set delay_dias=0`);assert.equal(await eligible(),false)
await db.exec(`update parcelas_acordo set vencimento=(now() at time zone 'America/Sao_Paulo')::date`);assert.equal(await eligible(),true)
await db.exec(`update mensagens set payload='{}',acordo_flow_id=null`);assert.equal(await eligible(),true)
console.log('8 cenarios passaram: D+5, baixa, pago, D+2, quebrado, lembrete antigo, D0 e mensagem sem parcela.');await db.close()
