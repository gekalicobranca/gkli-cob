import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('painel desconta só as linhas retidas e não atribui cobertura mensal a uma captação parcial', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create table conversoes_relatorio(id int, status text, total_cobrancas int, preview_json jsonb);
      create function public.easy_maestro_painel(uuid[],text) returns jsonb language sql as $painel$
        select jsonb_build_object('cobrancas', v.total_cobrancas, 'detalhe', case
          when v.status = 'concluido_com_alertas' then 'Importação concluída com alertas.' end,
          'cobertura',exists(select 1 from conversoes_relatorio cv where cv.id=v.id and cv.status in ('concluido','concluido_com_alertas')))
        from (select v.id, v.status, v.total_cobrancas from conversoes_relatorio v) v
      $painel$;
      insert into conversoes_relatorio values(1,'concluido_com_alertas',33,
        '{"conciliacaoMaestro":{"unidadesComEnvioPendente":["u"],"linhasComEnvioPendente":9}}');
    `)
    await db.exec(await readFile('supabase/migrations/20261124023100_easy_maestro_exibir_importacao_parcial.sql','utf8'))
    const painel = async () => (await db.query('select easy_maestro_painel(null,null) as p')).rows[0].p
    const parcial = await painel()
    assert.equal(parcial.cobrancas,24)
    assert.equal(parcial.cobertura,false)
    assert.equal(parcial.unidadesComEnvioPendente,1)
    assert.match(parcial.detalhe,/conferência de envio/)
    await db.exec("update conversoes_relatorio set preview_json='{}'")
    const anterior = await painel()
    assert.equal(anterior.cobrancas,33)
    assert.equal(anterior.cobertura,true)
    assert.equal(anterior.unidadesComEnvioPendente,0)
  } finally { await db.close() }
})
