import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fixtureFlow, iniciarFlow } from './easy-flow-transaction-fixture'
import { prepararConversao } from './easy-cap-transaction-fixture'
import { fixtureId as id } from './easy-p0-fixture'

test('montagem exige recibo do mesmo condomínio e operador, preserva execução alheia e recupera a mesma após liberação', async () => {
  const db = await fixtureFlow()
  try {
    await db.exec(await readFile('supabase/migrations/20261120013000_easy_flow_apos_captacao.sql','utf8'))
    const cap = await prepararConversao(db,20)
    async function iniciar(conversao=cap.id, operador=id(10), condo=id(2)) {
      const {rows:[{snapshot}]} = await db.query<{snapshot:string}>('select easy_flow_snapshot($1,$2) snapshot',[id(2),id(4)])
      const {rows:[{r}]} = await db.query<{r:{id:string;captacao_id:string;status:string}}>(
        "select to_jsonb(easy_flow_iniciar_da_captacao($1,$2,$3,$4,$5,$6,'{}','config',$7,$8)) r",
        [conversao,operador,condo,id(4),id(6),JSON.stringify([[id(30)]]),{canais:['email']},snapshot])
      return r
    }
    await assert.rejects(iniciar())
    await cap.confirmar()
    await assert.rejects(iniciar(cap.id,id(99)))
    await assert.rejects(iniciar(cap.id,id(10),id(99)))
    const anterior = await iniciarFlow(db)
    await assert.rejects(iniciar(), /outro Flow|execução aberta/)
    await db.query('select easy_flow_descartar($1,$2)',[anterior.run.id,id(10)])
    const nova = await prepararConversao(db,21)
    await nova.confirmar()
    await assert.rejects(iniciar(), /mais recente/)
    const r = await iniciar(nova.id)
    assert.equal(r.captacao_id,nova.id)
    assert.equal((await iniciar(nova.id)).id,r.id)
    await db.query('select easy_flow_montar($1,0,$2,$3)',[r.id,id(10),anterior.manifesto()])
    assert.equal((await iniciar(nova.id)).status,'pronto')
    assert.equal((await db.query('select * from email_agenda')).rows.length,0)
    await db.query("select easy_flow_liberar($1,0,$2,'fixture')",[r.id,id(10)])
    assert.equal((await iniciar(nova.id)).id,r.id)
    assert.equal((await db.query('select * from easy_flow_execucoes where captacao_id=$1',[nova.id])).rows.length,1)
    await db.exec('set role authenticated')
    await assert.rejects(db.query("select easy_flow_iniciar_da_captacao(null,null,null,null,null,null,null,null,null,null)"),/permission denied/)
  } finally {await db.close()}
})
