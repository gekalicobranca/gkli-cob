import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, mkdtemp, mkdir, utimes, rm, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fixtureFlow, iniciarFlow } from './easy-flow-transaction-fixture'
import { prepararConversao } from './easy-cap-transaction-fixture'
import { fixtureId as id } from './easy-p0-fixture'
import { recolherTemporarios } from './acordos-portais/espelhamento-temporarios.mjs'

test('expira staging abandonado por carteira e preserva replay e efeitos confirmados', async () => {
  const db = await fixtureFlow()
  try {
    await db.exec(await readFile('supabase/migrations/20261119205324_easy_recuperacao_administrativa.sql','utf8'))
    await db.exec(await readFile('supabase/migrations/20261120000100_easy_retencao_previas.sql','utf8'))
    const limpar = async (tipo:string, aplicar=false, carteira=id(1)) =>
      (await db.query<{n:number}>('select easy_expirar_previas($1,$2,$3) n',[carteira,tipo,aplicar])).rows[0].n
    const confirmada = await prepararConversao(db,20)
    await confirmada.confirmar()
    const abandonada = await prepararConversao(db,21)
    await prepararConversao(db,22)
    await db.query("update conversoes_relatorio set atualizado_em=now()-interval '8 days' where id=any($1::uuid[])",[[confirmada.id,abandonada.id]])
    await assert.rejects(abandonada.confirmar(), /expirou/)
    assert.equal(await limpar('cap',true,id(999)),0)
    assert.equal(await limpar('cap'),1)
    assert.equal(await limpar('cap',true),1)
    assert.equal(await limpar('cap',true),0)
    assert.equal((await confirmada.confirmar()).rows[0].resultado.jaConfirmada,true)
    await assert.rejects(abandonada.confirmar())
    assert.equal((await db.query<{plano:unknown}>("select preview_json#>'{easyCaptacao,plano}' as plano from conversoes_relatorio where id=$1",[abandonada.id])).rows[0].plano,null)
    const nova = await iniciarFlow(db)
    await db.query("update easy_flow_execucoes set created_at=now()-interval '8 days' where id=$1",[nova.run.id])
    await assert.rejects(nova.montar(), /expirou/)
    assert.equal(await limpar('flow',true),1)
    assert.equal(await limpar('flow',true),0)
    await assert.rejects(nova.montar())
    assert.equal((await db.query<{n:number}>('select count(*)::int n from easy_flow_reservas where execucao_id=$1',[nova.run.id])).rows[0].n,0)
    const flow = await iniciarFlow(db)
    await db.query("update easy_flow_execucoes set created_at=now()-interval '8 days' where id=$1",[flow.run.id])
    assert.equal(await limpar('flow'),1)
    await db.query("insert into easy_flow_eventos(execucao_id,operador_id,evento,dados,operacao_id) values($1,$2,'reconciliacao_administrativa','{}',$3)",[flow.run.id,id(10),id(70)])
    assert.equal(await limpar('flow',true),0)
    await db.query('update easy_flow_execucoes set created_at=now() where id=$1',[flow.run.id])
    await flow.montar()
    await flow.liberar()
    await db.query("update easy_flow_execucoes set created_at=now()-interval '8 days' where id=$1",[flow.run.id])
    assert.equal(await limpar('flow',true),0)
    assert.equal((await db.query<{n:number}>('select count(*)::int n from easy_flow_eventos where operacao_id=$1',[id(70)])).rows[0].n,1)
    await db.exec('set role authenticated')
    await assert.rejects(limpar('cap',true),/permission denied/)
  } finally { await db.close() }
})

test('temporários do worker preservam processo vivo, pasta recente e arquivos externos', async () => {
  const raiz = await mkdtemp(join(tmpdir(),'easy-retencao-teste-'))
  try {
    const filho = spawn(process.execPath,['-e',''],{windowsHide:true})
    await once(filho,'exit')
    const antiga = new Date(Date.now()-48*3600_000)
    const orfa = 'gkli-easy-espelho-v2-'+filho.pid+'-Abc123'
    const recente = 'gkli-easy-espelho-v2-'+filho.pid+'-Abc124'
    const ativa = 'gkli-easy-espelho-v2-'+process.pid+'-Abc125'
    const semMarcador = 'gkli-easy-espelho-v2-'+filho.pid+'-Abc126'
    for (const nome of [orfa,recente,ativa,semMarcador,'arquivo-financeiro']) {
      const pasta = join(raiz,nome)
      await mkdir(pasta)
      if ([orfa,recente,ativa].includes(nome)) await writeFile(join(pasta,'.easy-espelhar-temporario'),nome)
      if (nome!==recente) await utimes(pasta,antiga,antiga)
    }
    assert.equal(await recolherTemporarios(raiz),1)
    assert.deepEqual((await readdir(raiz)).sort(),[ativa,recente,semMarcador,'arquivo-financeiro'].sort())
    assert.equal(await recolherTemporarios(raiz),0)
  } finally { await rm(raiz,{recursive:true,force:true}) }
})
