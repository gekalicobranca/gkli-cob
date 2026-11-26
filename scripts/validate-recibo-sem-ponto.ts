import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { identidadeRecibo, observacoesComRecibo } from '../features/importacoes/identidade-recibo'
import { resolverRecibosLello } from '../features/importacoes/maestro-recibos-lello'

const migration = 'supabase/migrations/20261126113332_normalizar_recibo_sem_ponto.sql'

test('pontos não fazem parte do recibo em campos explícitos, referências ou observações', () => {
  for (const recibo of ['12345678.', '12.345.678', '12345678...']) {
    for (const fonte of [{ recibo }, { referencia: recibo }, { observacoes: `Texto | Recibo: ${recibo} | Origem` }]) {
      assert.deepEqual(identidadeRecibo(fonte), { recibo: '12345678', marcador: null })
    }
  }
  assert.deepEqual(identidadeRecibo({ recibo: 'AE 12.345.678.' }), { recibo: '12345678', marcador: 'AE' })
  assert.deepEqual(identidadeRecibo({ recibo: 'LELLO-X-123/9' }), { recibo: 'LELLO-X-123/9', marcador: null })
  assert.equal(identidadeRecibo({ recibo: '...' }), null)
  assert.equal(identidadeRecibo({ observacoes: 'Recibo 12345678@inválido' }), null)
})

test('grava marcador canônico sem alterar pontos do texto e continua recusando outro número', () => {
  assert.equal(observacoesComRecibo({ recibo: '12.345.678.', observacoes: 'Recibo: 12345678. | Referência 1.2.' }),
    'Recibo: 12345678 | Referência 1.2.')
  assert.equal(observacoesComRecibo({ recibo: 'AE 12.345.678', observacoes: 'Origem.' }), 'Recibo AE 12345678 | Origem.')
  assert.throws(() => observacoesComRecibo({ recibo: '12345678.', observacoes: 'Recibo 87654321.' }), /diverge/)
})

test('Lello reconhece pontuação no recibo antigo e mantém idempotência e conflitos', () => {
  const linha = { unidade: '101', bloco: '0', vencimento: '10/10/2026', valorPrincipal: 100, recibo: 'LELLO-123-101-20261010' }
  const cota = { unidade_id: 'unidade', unidades: { identificacao: '101', bloco: '0' }, vencimento: '2026-10-10',
    valor_original: 100, observacoes: 'Origem | Recibo: 12.345.678.', origem_importacao: 'importacao_cobrancas - 17/11/2026' }
  const resolvidas = resolverRecibosLello([linha], [cota])
  assert.equal(resolvidas[0].recibo, '12345678')
  assert.deepEqual(resolverRecibosLello(resolvidas, [cota]), resolvidas)
  assert.throws(() => resolverRecibosLello([linha], [{ ...cota, observacoes: 'Recibo 12345678. | Recibo 87654321.' }]), /confira o recibo/)
})

test('migração alinha SQL, agrega inventário legado e mantém cobranças, acordos e parcelas intactos', async () => {
  const db = new PGlite()
  const unidade = '00000000-0000-0000-0000-000000000001'
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table cobrancas(id serial primary key, unidade_id uuid, observacoes text, valor numeric);
      create table acordos(id integer primary key, cobranca_id integer references cobrancas(id), valor numeric);
      create table parcelas_acordo(id integer primary key, acordo_id integer references acordos(id), valor numeric);
      insert into cobrancas(unidade_id,observacoes,valor) values
      ('${unidade}','Recibo 12345678.',100),('${unidade}','Recibo 12345678',110),('${unidade}','Recibo 12.34.56',120);
      insert into acordos values (1,1,100); insert into parcelas_acordo values (1,1,50),(2,1,50);`)
    await db.exec(readFileSync('supabase/migrations/20260923010000_cobrancas_recibo_guard.sql', 'utf8'))
    await db.exec('create index easy_cap_identidade_recibo_idx on cobrancas(unidade_id,cobranca_recibo_identidade(observacoes))')
    const snapshot = async () => (await db.query(`select jsonb_build_object(
      'cobrancas',(select jsonb_agg(to_jsonb(c) order by id) from cobrancas c),
      'acordos',(select jsonb_agg(to_jsonb(a) order by id) from acordos a),
      'parcelas',(select jsonb_agg(to_jsonb(p) order by id) from parcelas_acordo p)) dados`)).rows
    const antes = await snapshot()
    await db.exec(readFileSync(migration, 'utf8'))
    assert.deepEqual(await snapshot(), antes)
    await db.exec('set enable_seqscan=off')
    const porIndice = await db.query<{ id: number }>(
      'select id from cobrancas where unidade_id=$1 and cobranca_recibo_identidade(observacoes)=$2 order by id', [unidade, '12345678'])
    assert.deepEqual(porIndice.rows.map(r => r.id), [1, 2])
    await db.exec('reset enable_seqscan')
    for (const observacoes of ['Recibo 12345678.', 'Histórico | recibo: AE 12.345.678.', 'Recibo LELLO-X-123/9', 'Recibo ABC sem número', 'Recibo 12345678@inválido']) {
      const r = await db.query<{ recibo: string | null }>('select cobranca_recibo_identidade($1) recibo', [observacoes])
      assert.equal(r.rows[0].recibo, identidadeRecibo({ observacoes })?.recibo ?? null)
    }
    const inventario = (await db.query<{ recibo: string; registros: number }>('select recibo,registros from cobrancas_recibo_guard order by recibo')).rows
    assert.deepEqual(inventario.map(r => [r.recibo, Number(r.registros)]), [['123456', 1], ['12345678', 2]])
    await assert.rejects(db.query('insert into cobrancas(unidade_id,observacoes,valor) values($1,$2,50)', [unidade, 'Recibo 12.345.678.']), /Recibo já cadastrado/)
    await db.exec("update cobrancas set observacoes='Recibo 12345678' where id=1; delete from cobrancas where id=2;")
    assert.equal(Number((await db.query<{ registros: number }>("select registros from cobrancas_recibo_guard where recibo='12345678'")).rows[0].registros), 1)
    await db.exec('set role service_role')
    await assert.rejects(db.exec('delete from cobrancas_recibo_guard'), /permission denied/)
    await db.exec('reset role')
  } finally { await db.close() }
})
