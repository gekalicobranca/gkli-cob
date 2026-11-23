import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('validação e etapa pertencem à tentativa em curso', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create table agente_execucoes(id int,condominio_id int,carteira_id int,status text,origem text,created_at timestamptz,iniciado_em timestamptz);
      create table agente_arquivos(id int,execucao_id int,created_at timestamptz);
      create table conversoes_relatorio(id int,condominio_id int,carteira_id int);
      create function easy_maestro_painel(uuid[],text) returns jsonb language sql as $f$
        select jsonb_build_object('estado',case when e.status = 'em_execucao' then 'captando' else 'final' end,'validacao',v.id)
        from agente_execucoes e cross join (values(1,2)) as r(condominio_id,carteira_id)
        left join lateral (select v.id from agente_arquivos a join conversoes_relatorio v on v.id=a.id
          where a.execucao_id = e.id and v.condominio_id = r.condominio_id and v.carteira_id = r.carteira_id
          order by a.created_at desc limit 1) v on true
      $f$;
      insert into agente_execucoes values(1,1,2,'em_execucao','maestro',now()-interval '1 day',now()-interval '2 minutes');
      insert into agente_arquivos values(10,1,now()-interval '1 hour');
      insert into conversoes_relatorio values(10,1,2);
    `)
    await db.exec(await readFile('supabase/migrations/20261124002500_maestro_etapa_importacao.sql','utf8'))
    const painel = async () => (await db.query('select easy_maestro_painel(null,null) p')).rows[0].p
    assert.deepEqual(await painel(),{estado:'captando',validacao:null})
    await db.exec('insert into agente_arquivos values(20,1,now())')
    assert.deepEqual(await painel(),{estado:'importando',validacao:null})
    await db.exec('insert into conversoes_relatorio values(20,1,2)')
    assert.deepEqual(await painel(),{estado:'importando',validacao:20})
    await db.exec("update agente_execucoes set status='sucesso'")
    assert.deepEqual(await painel(),{estado:'final',validacao:20})
  } finally { await db.close() }
})
