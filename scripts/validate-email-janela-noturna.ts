import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { emailHorarioPermitido } from '../features/mensageria/email-janela'

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const clock = (sql: string) => sql.replaceAll('clock_timestamp()', 'public.test_now()').replaceAll('now()', 'public.test_now()').replaceAll('test_public.test_now()', 'test_now()')
test('janela de Brasília inclui 22h e exclui 06h', () => {
  for (const [hora, permitido] of [['00:59', false], ['01:00', true], ['08:59', true], ['09:00', false], ['15:00', false]] as const) {
    assert.equal(emailHorarioPermitido(new Date(`2050-09-17T${hora}:00Z`)), permitido)
  }
})

test('SQL: cron, madrugada, cotas, bloqueio diurno e concorrência', async () => {
  const db = new PGlite()
  try {
    const originalTest = readFileSync('scripts/validate-email-agenda.ts', 'utf8')
    const schema = originalTest.split('await db.exec(`')[1].split('`)')[0]
    await db.exec(schema)
    await db.exec(clock(readFileSync('supabase/migrations/20260916170000_agenda_email_carteira.sql', 'utf8')))
    await db.exec('create function flow_cobranca_mensagem_elegivel(m mensagens) returns boolean language sql as $$select true$$;')
    await db.exec(clock(readFileSync('supabase/migrations/20260922190000_thunderbird_envios.sql', 'utf8')))
    await db.exec(`create function email_processar_agenda() returns bigint language plpgsql as $$begin
      return 123; end$$;
      create schema cron;
      create table cron.job(jobid bigint,jobname text,schedule text,active boolean);
      insert into cron.job values(1,'gkli-email-agenda','*/10 12-20 * * *',true);
      create function cron.alter_job(p_jobid bigint,schedule text) returns void language sql as $$update cron.job set schedule=$2 where jobid=$1$$;
    `)
    await db.exec(clock(readFileSync('supabase/migrations/20261015180513_email_agenda_janela_noturna.sql', 'utf8')))
    assert.equal((await db.query<{schedule:string}>('select schedule from cron.job')).rows[0].schedule, '*/10 1-8 * * *')
    await db.query('insert into carteiras(id) values ($1)', [id(1)])
    const slots: string[] = []
    for (let i = 100; i < 151; i++) {
      await db.query('insert into mensagens(id,carteira_id) values ($1,$2)', [id(i), id(1)])
      slots.push((await db.query<{slot:string}>('select email_reservar_horario($1,$2) slot', [id(i), 'shared.example'])).rows[0].slot)
    }
    assert.equal(new Date(slots[0]).toISOString(), '2050-09-17T01:00:00.000Z')
    assert.equal(new Date(slots[12]).toISOString(), '2050-09-17T03:00:00.000Z')
    assert.equal(new Date(slots[47]).toISOString(), '2050-09-17T08:50:00.000Z')
    assert.equal(new Date(slots[48]).toISOString(), '2050-09-18T01:00:00.000Z')
    assert.equal((await db.query<{r:any}>('select email_reservar_disparo($1,$2) r', [id(100), 'shared.example'])).rows[0].r.permitido, false)
    assert.equal((await db.query('select * from email_tentativas')).rows.length, 0)
    assert.equal((await db.query<{r:number|null}>('select email_processar_agenda() r')).rows[0].r, null)
    await db.query("update fake_clock set t='2050-09-17 01:00Z'")
    assert.equal((await db.query<{r:number}>('select email_processar_agenda() r')).rows[0].r, 123)
    await db.query("update carteiras set email_transporte='thunderbird' where id=$1", [id(1)])
    await db.query("insert into thunderbird_dispositivos(id,carteira_id,email,token_hash,automatico,testado_em) values ($1,$2,'sender@shared.example','test',true,test_now())", [id(2),id(1)])
    await db.query("update fake_clock set t='2050-09-17 09:00Z'")
    assert.equal((await db.query<{r:any}>('select thunderbird_reservar($1,false) r', [id(2)])).rows[0].r, null)
    await db.query("insert into thunderbird_envios(id,dispositivo_id,tipo,estado) values ($1,$2,'fila','reservado')", [id(3),id(2)])
    assert.equal((await db.query<{r:boolean}>('select thunderbird_iniciar($1,$2) r', [id(2),id(3)])).rows[0].r, false)
    await db.query("delete from thunderbird_envios where id=$1", [id(3)])
    await db.query("update carteiras set email_transporte='smtp' where id=$1", [id(1)])
    await db.query("update fake_clock set t='2050-09-17 01:00Z'")
    const claims = await Promise.all([1, 2].map(() => db.query<{r:any}>('select email_reservar_disparo($1,$2) r', [id(100), 'shared.example'])))
    assert.equal(claims.filter(x => x.rows[0].r.permitido).length, 1)
    await assert.rejects(db.query('select email_reservar_horario($1,$2)', [id(100), 'shared.example']), /tentativa/)
    await db.query('update carteiras set email_limite_diario=1 where id=$1', [id(1)])
    const capped = (await db.query<{slot:string}>('select email_reservar_horario($1,$2) slot', [id(150), 'other.example'])).rows[0].slot
    assert.ok(new Date(capped).getTime() >= new Date('2050-09-18T03:00Z').getTime())
    await db.exec('set role authenticated')
    await assert.rejects(db.query("select email_janela_noturna('2050-09-17T01:00Z')"), /permission denied/)
  } finally { await db.close() }
})
