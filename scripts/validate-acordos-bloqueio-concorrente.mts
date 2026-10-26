import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
const db = new PGlite()
const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
await db.exec(`create schema auth; create function auth.uid() returns uuid language sql as $$select '${id(99)}'::uuid$$;
create function current_user_can_access_carteira(uuid) returns boolean language sql as $$select true$$;
create table profiles(id uuid,role text); insert into profiles values('${id(99)}','operador');
create table cobrancas(id uuid primary key,duplicada_de_id uuid,carteira_id uuid,condominio_id uuid,unidade_id uuid,status text,status_operacional text);
create table acordos(id uuid primary key default gen_random_uuid(),carteira_id uuid,cobranca_id uuid,condominio_id uuid,unidade_id uuid,tipo text,numero_processo text,valor_acordado numeric,entrada numeric,despesa_cobranca_percentual numeric,despesa_cobranca_valor numeric,data_acordo date,status text,fluxo_status text,exige_aprovacao_sindico boolean,documento_url text,observacoes text);
create table acordo_cobrancas(acordo_id uuid,cobranca_id uuid,valor_original_no_acordo numeric,valor_atualizado_no_acordo numeric,encargos_no_acordo numeric,valor_total_no_acordo numeric);
create table parcelas_acordo(acordo_id uuid,numero int,tipo_parcela text,valor numeric,vencimento date,status text);
insert into cobrancas(id,carteira_id,condominio_id,unidade_id) select ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'${id(80)}','${id(81)}','${id(82)}' from generate_series(1,6) n;`)
// The fixture is the production RPC captured before applying this migration.
await db.exec(readFileSync('scripts/fixtures/acordos/criar-acordo-financeiro-antes-bloqueio.sql','utf8'))
const migration=readFileSync('supabase/migrations/20261026124600_bloquear_cobranca_em_outro_acordo.sql','utf8')
await db.exec(migration); await db.exec(migration)
async function criar(ids:number[]){
 return (await db.query<{id:string}>(`select criar_acordo_financeiro($1,$2,$3,$4,'extrajudicial',null,100,0,10,10,current_date,'ativo','boletos_solicitados',false,null,null,$5,$6,'em_negociacao') id`,[id(80),id(ids[0]),id(81),id(82),JSON.stringify(ids.map(n=>({cobranca_id:id(n)}))),JSON.stringify([{numero:1,valor:100,vencimento:'2026-10-26'}])])).rows[0].id
}
const primeiro=await criar([1,2])
await assert.rejects(criar([1]),/já pertence ao acordo/)
await assert.rejects(criar([3,2]),/já pertence ao acordo/)
assert.equal((await db.query<{n:number}>('select count(*)::int n from acordos')).rows[0].n,1)
assert.equal((await db.query<{n:number}>('select count(*)::int n from parcelas_acordo')).rows[0].n,1)
await criar([3]) // Outra cobrança, mesma unidade.
await db.query("update acordos set status='quitado' where id=$1",[primeiro])
await assert.rejects(criar([1]),/já pertence ao acordo/)
await db.query("update acordos set status='cancelado' where id=$1",[primeiro])
await criar([1])
// Legado: vínculo apenas em acordos.cobranca_id, sem composição.
await db.exec(`insert into acordos(cobranca_id,status) values('${id(4)}','em_elaboracao')`)
await assert.rejects(criar([4]),/já pertence ao acordo/)
await db.exec(`insert into acordos(cobranca_id,status,observacoes) values('${id(5)}','ativo','[DUPLICIDADE_ACORDO_CONCILIADA]')`)
await criar([5])
console.log('OK: principal, composição, elaboração, quitado, cancelado, cópia arquivada, mesma unidade com outra dívida, rollback e migração idempotente.')
await db.close()
