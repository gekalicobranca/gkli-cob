import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { janelaNoturna, validarConfiguracao, validarLink, evidencia } from './core.mjs'

test('janela usa São Paulo, incluindo virada UTC e limites', () => {
 for (const [hora, esperado] of [['03:29',false],['03:30',true],['08:24',true],['08:25',false],['23:00',false]]) assert.equal(janelaNoturna(new Date(`2026-10-20T${hora}:00Z`)), esperado)
})
test('Follow exige identidade e código confirmados; Petit Royal inativo fica fora', async () => {
 const db=new PGlite()
 try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create table condominios(id uuid primary key,status text,administradora text);
  grant select on condominios to service_role;
  create function current_user_is_admin() returns boolean language sql as 'select false';`)
  const clock="timestamptz '2026-10-21 04:00Z'"
  for(const arquivo of ['20261020121015_scanner_enriquecimento_noturno.sql','20261021013337_scanner_follow_lello.sql']) {
   const sql=await readFile(new URL(`../../supabase/migrations/${arquivo}`,import.meta.url),'utf8')
   await db.exec(sql.replaceAll('now()',clock))
  }
  const follow='13290a44-ec8d-4232-81e7-711196547f91',petit=randomUUID(),outro=randomUUID()
  await db.query("insert into condominios values($1,'ativo','HUBERT/Lello'),($2,'inativo','Lello'),($3,'ativo','HUBERT/Lello')",[follow,petit,outro])
  for(const id of [follow,petit,outro])await db.query("insert into scanner_configuracoes(condominio_id,codigo_portal,perfil_acesso,unidades,ativo) values($1,'1','PADRAO',array['001'],true)",[id])
  await db.exec('set role service_role')
  assert.equal((await db.query('select * from scanner_reivindicar($1)',[randomUUID()])).rows.length,0)
  await db.query("update scanner_configuracoes set codigo_portal='62430' where condominio_id=$1",[follow])
  const token=randomUUID(),claim=(await db.query('select * from scanner_reivindicar($1)',[token])).rows
  assert.equal(claim.length,1);assert.equal(claim[0].condominio_id,follow)
  await db.query("select scanner_concluir($1,0,'[]',false)",[token])
  await db.exec('reset role')
  await db.query("update condominios set status='inativo' where id=$1",[follow])
  await db.exec(`update scanner_controle set proxima_execucao=${clock};set role service_role`)
  assert.equal((await db.query('select * from scanner_reivindicar($1)',[randomUUID()])).rows.length,0)
  assert.equal((await db.query("select has_function_privilege('authenticated','scanner_reivindicar(uuid)','execute') as allowed")).rows[0].allowed,false)
 } finally {await db.close()}
})
test('lotes limitados, códigos preservados e destinos restritos', () => {
 const config = { codigo_portal: '63004', perfil_acesso: 'SAFIRA', cursor: 0, unidades: Array.from({ length: 25 }, (_, i) => String(i).padStart(6,'0')) }
 assert.equal(validarConfiguracao(config).length, 20)
 assert.equal(validarConfiguracao(config)[0], '000000')
 assert.deepEqual(validarConfiguracao({ ...config, unidades: ['A001','000001','0V01-1'] }), ['A001','000001','0V01-1'])
 assert.throws(() => validarConfiguracao({ ...config, unidades: ['1','1'] }))
 assert.throws(() => validarConfiguracao({ ...config, perfil_acesso: '../SECRET' }))
 assert.throws(() => validarLink('https://evil.test/relatorios/Acordo.do?codCondo=63004&codUnidade=000001', '63004','000001','/relatorios/Acordo.do'))
 assert.throws(() => validarLink('https://portal.lellocondominios.com.br/relatorios/Acordo.do?codCondo=1&codUnidade=000001', '63004','000001','/relatorios/Acordo.do'))
 assert.equal(evidencia('1','contatos',{ nome: 'A' }).sha256, evidencia('1','contatos',{ nome: 'A' }).sha256)
})
test('SQL real: permissão, reserva global, cursor, deduplicação, backoff e recuperação', async () => {
 const db = new PGlite()
 try {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create table condominios(id uuid primary key, status text, administradora text);
 grant select on condominios to service_role;
 create function current_user_is_admin() returns boolean language sql as 'select false';
 create table test_clock(value timestamptz); insert into test_clock values('2026-10-20 04:00Z');
 grant select on test_clock to service_role;
 create function test_now() returns timestamptz language sql as 'select value from test_clock';`)
 const sql = await readFile(new URL('../../supabase/migrations/20261020121015_scanner_enriquecimento_noturno.sql', import.meta.url), 'utf8')
 // Apenas o relógio é substituído para testar o SQL em horários determinísticos.
 await db.exec(sql.replaceAll('now()', 'public.test_now()'))
 const condo = randomUUID(), config = randomUUID(), token = randomUUID()
 await db.query('insert into condominios values($1,\'ativo\',\'Lello\')',[condo])
 await db.query(`insert into scanner_configuracoes(id,condominio_id,codigo_portal,perfil_acesso,unidades,ativo) values($1,$2,'63004','SAFIRA',array['000001','000002'],true)`,[config,condo])
 await db.exec('set role authenticated')
 assert.equal((await db.query('select * from scanner_configuracoes')).rows.length,0)
 await assert.rejects(db.query('select * from scanner_reivindicar($1)',[token]), /permission denied/)
 await db.exec('reset role; set role service_role')
 assert.equal((await db.query('select * from scanner_reivindicar($1)',[token])).rows.length,1)
 assert.equal((await db.query('select * from scanner_reivindicar($1)',[randomUUID()])).rows.length,0)
 await assert.rejects(db.query(`select scanner_concluir($1,1,'[]',false)`,[randomUUID()]),/Reserva/)
 const e = evidencia('000001','contatos',{ nome: 'Teste' })
 await assert.rejects(db.query('select scanner_concluir($1,1,$2,false)',[token,JSON.stringify([{ ...e, unidade_portal: '999999' }])]),/fora do lote/)
 await assert.rejects(db.query(`select scanner_concluir($1,1,'[]',false)`,[token]),/incompletas/)
 await db.query('select scanner_concluir($1,1,$2,false)',[token,JSON.stringify([e,e,evidencia('000001','pagamentos',{status:'inconclusivo'})])])
 assert.equal((await db.query('select * from scanner_evidencias')).rows.length,2)
 assert.equal((await db.query('select cursor from scanner_configuracoes')).rows[0].cursor,1)
 assert.equal((await db.query('select * from scanner_reivindicar($1)',[randomUUID()])).rows.length,0)
 // Três falhas preservam o cursor e pausam o condomínio.
 for (let i=0;i<3;i++) {
   await db.exec(`reset role; update test_clock set value=value+interval '31 minutes'; set role service_role`)
   // Na segunda/terceira falha o backoff é de 60/120 minutos.
   if (i>0) await db.exec(`reset role; update test_clock set value=value+interval '90 minutes'; set role service_role`)
   // Mantém o teste dentro da janela na passagem seguinte.
   if (i===2) await db.exec(`reset role; update test_clock set value='2026-10-21 04:00Z'; set role service_role`)
   const t=randomUUID()
   assert.equal((await db.query('select * from scanner_reivindicar($1)',[t])).rows.length,1)
   await db.query(`select scanner_concluir($1,1,'[]',true)`,[t])
 }
 const estado=(await db.query('select * from scanner_configuracoes')).rows[0]
 assert.equal(estado.ativo,false); assert.equal(estado.cursor,1); assert.equal(estado.falhas,3)
 // Recuperação após queda: reserva antiga não pode finalizar nem ser sobreposta.
 await db.exec(`reset role; update scanner_configuracoes set ativo=true,proxima_execucao=test_now(); update scanner_controle set proxima_execucao=test_now(); set role service_role`)
 const antigo=randomUUID()
 await db.query('select * from scanner_reivindicar($1)',[antigo])
 await db.exec(`reset role; update test_clock set value=value+interval '6 minutes'; set role service_role`)
 assert.equal((await db.query('select * from scanner_reivindicar($1)',[randomUUID()])).rows.length,0)
 await assert.rejects(db.query(`select scanner_concluir($1,2,'[]',false)`,[antigo]),/Reserva/)
 await db.exec(`reset role; update test_clock set value='2026-10-21 15:00Z'; set role service_role`)
 assert.equal((await db.query('select * from scanner_reivindicar($1)',[randomUUID()])).rows.length,0)
 } finally { await db.close() }
})
