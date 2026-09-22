import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { conciliarCobrancaImportada } from '../features/importacoes/cobrancas-conciliacao'
import { identidadeRecibo, observacoesComRecibo } from '../features/importacoes/identidade-recibo'

const antiga = {
  id: 'antiga', unidade_id: 'unidade', condominio_id: 'condominio', carteira_id: 'carteira',
  competencia: null, vencimento: '2026-06-10', valor_original: 100, valor_atualizado: 110,
  observacoes: 'Conversão de relatório - recibo 12345', status_financeiro: 'em_aberto', status_operacional: 'em_cobranca_ativa',
}
const entrada = { ...antiga, competencia: '06/2026' }
function client(rows: typeof antiga[]) {
  return { from: () => {
    let selected = [...rows]
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { selected = selected.filter(row => row[key] === value); return query },
      order: () => query,
      range: async (start: number, end: number) => ({ data: selected.slice(start, end + 1), error: null }),
    }
    return query
  } }
}
test('reimportação reconhece recibo nas observações apesar da competência antiga ausente', async () => {
  assert.equal((await conciliarCobrancaImportada(client([antiga]), entrada)).status, 'ja_existente')
  assert.equal((await conciliarCobrancaImportada(client([{ ...antiga, competencia: '2026-06-01' }]), entrada)).status, 'ja_existente')
})
test('marcadores, quitação, valores, competência e vencimento divergentes bloqueiam nova cópia', async () => {
  for (const changes of [
    { observacoes: 'Recibo J 12345' }, { status_financeiro: 'quitado' },
    { status_operacional: 'cancelado' }, { valor_original: 99 }, { valor_atualizado: 120 },
    { competencia: '05/2026' }, { vencimento: '2026-05-10' },
  ]) assert.equal((await conciliarCobrancaImportada(client([{ ...antiga, ...changes }]), entrada)).status, 'divergente', JSON.stringify(changes))
  assert.equal((await conciliarCobrancaImportada(client([{ ...antiga, observacoes: 'Recibo J 12345' }]), { ...entrada, recibo: 'AE 12345' })).status, 'divergente')
})
test('identificador completo distingue recibos, unidades e blocos diferentes', async () => {
  for (const changes of [{ observacoes: 'Recibo 123456' }, { unidade_id: 'outra-unidade-bloco-B' }]) {
    assert.equal((await conciliarCobrancaImportada(client([{ ...antiga, ...changes }]), entrada)).status, 'novo')
  }
  assert.deepEqual(identidadeRecibo({ recibo: 'LELLO-X-123/9' }), { recibo: 'LELLO-X-123/9', marcador: null })
  assert.equal(identidadeRecibo({ observacoes: 'recibo ABC sem número' }), null)
  assert.equal(identidadeRecibo({ observacoes: 'Recibo 12345@inválido' }), null)
})
test('mudança de carteira e registros além da primeira página não recriam recibo', async () => {
  const rows = Array.from({ length: 501 }, (_, i) => ({ ...antiga, id: String(i), observacoes: `Recibo ${i + 90000}` }))
  rows.push({ ...antiga, carteira_id: 'carteira-anterior' })
  assert.equal((await conciliarCobrancaImportada(client(rows), entrada)).status, 'ja_existente')
})
test('múltiplos registros existentes não escolhem canônico automaticamente', async () => {
  const result = await conciliarCobrancaImportada(client([antiga, { ...antiga, id: 'segunda' }]), entrada)
  assert.equal(result.status, 'divergente')
  assert.match(result.motivo, /Mais de um registro/)
})
test('preserva zero, rejeita valor inválido e erro de leitura', async () => {
  assert.equal((await conciliarCobrancaImportada(client([antiga]), { ...entrada, valor_original: 0 })).status, 'divergente')
  await assert.rejects(conciliarCobrancaImportada(client([antiga]), { ...entrada, valor_original: 'inválido' }), /Valor inválido/)
  const query: any = { select: () => query, eq: () => query, order: () => query, range: async () => ({ error: { message: 'indisponível' } }) }
  await assert.rejects(conciliarCobrancaImportada({ from: () => query }, entrada), /indisponível/)
})
test('recibo explícito é persistido e conflito entre campos exige revisão', () => {
  assert.equal(observacoesComRecibo({ recibo: 'AE 123', observacoes: 'Origem conferida' }), 'Recibo AE 123 | Origem conferida')
  assert.throws(() => observacoesComRecibo({ recibo: '123', observacoes: 'Recibo 456' }), /diverge/)
  assert.equal(observacoesComRecibo({ observacoes: 'Sem recibo' }), 'Sem recibo')
})
test('trava SQL preserva legado, impede repetição e mantém contagem transacional', async () => {
  const db = new PGlite()
  const unit = '00000000-0000-0000-0000-000000000001'
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table cobrancas(id serial primary key, unidade_id uuid, observacoes text, valor numeric);
      insert into cobrancas(unidade_id,observacoes,valor) values ('${unit}','Recibo J 12345',100),('${unit}','Recibo 12345',100);`)
    const before = (await db.query('select * from cobrancas order by id')).rows
    await db.exec(readFileSync('supabase/migrations/20260923010000_cobrancas_recibo_guard.sql', 'utf8'))
    assert.deepEqual((await db.query('select * from cobrancas order by id')).rows, before)
    for (const obs of ['Recibo 12345', 'recibo: AE 12345 | outra observação', 'Recibo LELLO-X-123/9', 'Recibo 12345@inválido', 'Sem recibo', 'Recibo ABC sem número']) {
      const result = await db.query<{ recibo: string | null }>('select cobranca_recibo_identidade($1) recibo', [obs])
      assert.equal(result.rows[0].recibo, identidadeRecibo({ observacoes: obs })?.recibo ?? null)
    }
    await assert.rejects(db.query('insert into cobrancas(unidade_id,observacoes) values($1,$2)', [unit, 'Recibo AE 12345']), /Recibo já cadastrado/)
    assert.equal((await db.query('select * from cobrancas')).rows.length, 2)
    await db.exec('update cobrancas set valor=101 where id=1; delete from cobrancas where id=1;')
    await assert.rejects(db.query('insert into cobrancas(unidade_id,observacoes) values($1,$2)', [unit, 'Recibo 12345']), /Recibo já cadastrado/)
    await db.exec('delete from cobrancas where id=2')
    await db.query('insert into cobrancas(unidade_id,observacoes) values($1,$2)', [unit, 'Recibo 12345'])
    await db.query('insert into cobrancas(unidade_id,observacoes) values($1,$2)', [unit, 'Recibo 54321'])
    await assert.rejects(db.query("update cobrancas set observacoes='Recibo 12345' where observacoes='Recibo 54321'"), /Recibo já cadastrado/)
    assert.equal((await db.query('select * from cobrancas_recibo_guard')).rows.length, 2)
    await assert.rejects(db.query(`insert into cobrancas(unidade_id,observacoes) values($1,'Recibo 789'),($1,'Recibo 789')`, [unit]), /Recibo já cadastrado/)
    assert.equal((await db.query("select * from cobrancas where observacoes='Recibo 789'")).rows.length, 0)
    await db.exec('set role service_role')
    await assert.rejects(db.exec('delete from cobrancas_recibo_guard'), /permission denied/)
    await db.exec('reset role')
  } finally { await db.close() }
})
