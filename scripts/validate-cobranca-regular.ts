import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { normalizeCobrancaStatusOperacional } from '../lib/core/status-normalizers'
import { simularPropostaKeila } from '../features/keila/casos'
import { COBRANCA_STATUS_OPERACIONAIS_ATIVOS } from '../lib/constants/cobrancas'
async function main() {
assert.equal(normalizeCobrancaStatusOperacional('regular'),'regular')
assert.ok(!(COBRANCA_STATUS_OPERACIONAIS_ATIVOS as string[]).includes('regular'))
const recente={id:'regular',vencimento:'2026-10-05',status_operacional:'regular',status_financeiro:'em_aberto',valor_atualizado:100}
assert.ok(simularPropostaKeila([recente],30,new Date('2026-10-08T15:00:00Z')))
assert.equal(simularPropostaKeila([{...recente,status_operacional:'novo'}],30,new Date('2026-10-08T15:00:00Z')),null)
const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create role service_role;
create table condominios(id uuid primary key,dias_apos_vencimento_regua int,inicio_cobranca_dias int);
create table cobrancas(id uuid primary key,condominio_id uuid,carteira_id uuid,duplicada_de_id uuid,vencimento date,status text,status_operacional text,status_financeiro text,origem_importacao text, constraint cobrancas_status_check check(status in('novo','em_cobranca_ativa','judicializado','suspenso','regular')));
create table acordos(cobranca_id uuid references cobrancas);create table acordo_cobrancas(cobranca_id uuid references cobrancas);
create table lote_itens(id uuid,cobranca_id uuid,cobranca_flow_id uuid);
create table auditoria_eventos(carteira_id uuid,entidade_tipo text,entidade_id uuid,evento_tipo text,titulo text,descricao text,antes jsonb,depois jsonb);
insert into condominios values('00000000-0000-0000-0000-000000000001',30,10);`)
await db.exec(readFileSync('supabase/migrations/20261008191133_cobrancas_status_regular.sql','utf8'))
const id='00000000-0000-0000-0000-000000000002'
await db.exec(`insert into cobrancas values('${id}','00000000-0000-0000-0000-000000000001',null,null,(now() at time zone 'America/Sao_Paulo')::date-3,'novo','novo','em_aberto','importacao')`)
assert.equal((await db.query<any>('select status_operacional from cobrancas')).rows[0].status_operacional,'regular')
await assert.rejects(db.exec(`update cobrancas set status='em_cobranca_ativa',status_operacional='em_cobranca_ativa' where id='${id}'`),/Regular/)
await assert.rejects(db.exec(`insert into lote_itens values(null,'${id}','00000000-0000-0000-0000-000000000003')`),/Regular/)
await db.exec(`insert into acordos values('${id}'); delete from acordos;`)
assert.equal((await db.query<any>('select liberar_cobrancas_regulares(null,null) n')).rows[0].n,0)
await db.exec(`alter table cobrancas disable trigger zz_classificar_cobranca_regular; update cobrancas set vencimento=(now() at time zone 'America/Sao_Paulo')::date-30; alter table cobrancas enable trigger zz_classificar_cobranca_regular;`)
assert.equal((await db.query<any>('select liberar_cobrancas_regulares(null,null) n')).rows[0].n,1)
assert.equal((await db.query<any>('select status_operacional from cobrancas')).rows[0].status_operacional,'novo')
console.log('OK: Regular não entra nos flows, aceita acordos e vira Novo no prazo da régua.')
}finally{await db.close()}}
main().catch(e=>{console.error(e);process.exitCode=1})
