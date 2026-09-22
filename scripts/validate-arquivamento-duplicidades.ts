import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { fixture, id, snapshotHash, apply } from './limpeza-duplicidades/fixture'

test('arquivo de ensaio não instala sem identificação explícita de ambiente isolado', async () => {
  const db=new PGlite()
  try { await assert.rejects(db.exec(readFileSync('scripts/limpeza-duplicidades/ensaio-arquivamento.sql','utf8')),/Somente ambiente/) }
  finally { await db.close() }
})
test('arquiva sem apagar nem alterar status/histórico, repete sem duplicar e reverte integralmente',async()=>{
  const db=await fixture()
  try {
    const hash=await snapshotHash(db)
    const messages=(await db.query('select * from mensagens order by id')).rows
    assert.equal(await apply(db,hash),'aplicado')
    assert.equal(await apply(db,hash),'ja_aplicado')
    assert.equal((await db.query<{total:number}>('select count(*)::int total from cobrancas')).rows[0].total,2)
    assert.equal((await db.query<{total:string}>('select sum(valor_atualizado) total from ensaio_duplicidades.cobrancas_canonicas')).rows[0].total,'110')
    assert.deepEqual((await db.query('select * from mensagens order by id')).rows,messages)
    assert.equal((await db.query(`select * from cobrancas where status<>'em_cobranca_ativa'`)).rows.length,0)
    assert.equal((await db.query('select * from ensaio_duplicidades.execucoes')).rows.length,1)
    await db.query('select ensaio_duplicidades.reverter($1,$2)',[id(99),'grupo-1'])
    assert.equal(await snapshotHash(db),hash)
    assert.deepEqual((await db.query('select * from mensagens order by id')).rows,messages)
    assert.equal((await db.query<{resultado:string}>('select ensaio_duplicidades.reverter($1,$2) resultado',[id(99),'grupo-1'])).rows[0].resultado,'ja_revertido')
    await assert.rejects(apply(db,hash),/reutilizada/)
  } finally { await db.close() }
})
test('hash inclui conteúdo JSON e bloqueia manifesto vencido',async()=>{
  const db=await fixture()
  try {
    const hash=await snapshotHash(db)
    await db.exec(`update mensagens set payload=payload||'{"nova_evidencia":true}'::jsonb`)
    await assert.rejects(apply(db,hash),/Snapshot alterado/)
    assert.equal((await db.query('select * from cobrancas where duplicada_de_id is not null')).rows.length,0)
  } finally {await db.close()}
})
test('pendência, agenda, tentativa incerta e vínculo financeiro impedem arquivamento',async()=>{
  for(const sql of [
    `insert into central_pendencias values('${id(20)}','${id(2)}',null,'aberta',null)`,
    `insert into email_agenda values('${id(6)}',null)`,
    `insert into email_tentativas values('${id(20)}','${id(6)}','incerto',null)`,
    `insert into acordos values('${id(20)}','${id(2)}',null)`,
  ]) {
    const db=await fixture()
    try {await db.exec(sql);await assert.rejects(apply(db,await snapshotHash(db)),/Pendência|Agenda|Vínculo/)} finally {await db.close()}
  }
})
test('erro depois da alteração desfaz o grupo inteiro, inclusive arquivamento',async()=>{
  const db=await fixture()
  try {
    const hash=await snapshotHash(db)
    await db.exec(`create function falha_auditoria() returns trigger language plpgsql as $$ begin raise exception 'falha injetada'; end $$;
      create trigger falha before insert on ensaio_duplicidades.execucoes for each row execute function falha_auditoria()`)
    await assert.rejects(apply(db,hash),/falha injetada/)
    assert.equal(await snapshotHash(db),hash)
  } finally {await db.close()}
})
test('reversão não sobrescreve mudança posterior nem reativa mensagens',async()=>{
  const db=await fixture()
  try {
    await apply(db,await snapshotHash(db))
    await db.query('update cobrancas set valor_atualizado=120 where id=$1',[id(1)])
    await assert.rejects(db.query('select ensaio_duplicidades.reverter($1,$2)',[id(99),'grupo-1']),/Estado posterior mudou/)
    assert.equal((await db.query('select * from mensagens where status not in (\'enviada\',\'cancelada\')')).rows.length,0)
  } finally {await db.close()}
})
test('nova dependência desconhecida e mensagem para outro débito impedem execução',async()=>{
  const db=await fixture()
  try {
    await db.exec('create table dependencia_nova(cobranca_id uuid references cobrancas(id))')
    await assert.rejects(apply(db,await snapshotHash(db)),/Dependência fora/)
    await db.exec('drop table dependencia_nova')
    await db.query('update mensagens set payload=$1 where id=$2',[JSON.stringify({cobranca_ids:[id(1),id(2),id(50)]}),id(6)])
    await assert.rejects(apply(db,await snapshotHash(db)),/Mensagem compartilhada/)
  } finally {await db.close()}
})
