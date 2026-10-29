import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { avaliarBloqueioGarantidora, normalizarDataBloqueio, statusComBloqueioGarantidora } from '../features/importacoes/bloqueio-garantidora'

const config = { bloqueio_garantidora_habilitado: true, bloqueio_garantidora_inicio: '2025-06-01', bloqueio_garantidora_fim: '2026-01-01' }
test('limites inclusivos e vencimentos fora do intervalo no mesmo mês', () => {
  for (const [vencimento, bloqueada] of [['2025-05-31', false], ['2025-06-01', true], ['2025-12-31', true], ['2026-01-01', true], ['2026-01-02', false], ['2026-01-10', false], ['2026-02-10', false]] as const) {
    assert.equal(avaliarBloqueioGarantidora(config, { vencimento }).bloqueada, bloqueada, vencimento)
  }
})
test('competência não substitui o dia do vencimento', () => {
  assert.equal(avaliarBloqueioGarantidora(config, { competencia: '12/2025', vencimento: '10/02/2026' }).bloqueada, false)
  assert.equal(avaliarBloqueioGarantidora(config, { competencia: '02/2026', vencimento: '31/12/2025' }).bloqueada, true)
  assert.throws(() => avaliarBloqueioGarantidora(config, { competencia: '12/2025' }), /Vencimento inválido/)
})
test('datas intermediárias não se expandem para o mês completo', () => {
  const c = { ...config, bloqueio_garantidora_inicio: '2025-06-15', bloqueio_garantidora_fim: '2026-01-31' }
  assert.equal(avaliarBloqueioGarantidora(c, { vencimento: '2025-06-14' }).bloqueada, false)
  assert.equal(avaliarBloqueioGarantidora(c, { vencimento: '2025-06-15' }).bloqueada, true)
  assert.equal(avaliarBloqueioGarantidora(c, { vencimento: '2026-01-31' }).bloqueada, true)
  assert.equal(avaliarBloqueioGarantidora(c, { vencimento: '2026-02-01' }).bloqueada, false)
})
test('calendário válido, sem inventar dia para mês isolado', () => {
  assert.equal(normalizarDataBloqueio('29/02/2024'), '2024-02-29')
  for (const data of ['29/02/2025', '2026-02-30', '2026-13-01', '01/2026', '2026-01', '']) assert.equal(normalizarDataBloqueio(data), null, data)
  assert.throws(() => avaliarBloqueioGarantidora({ ...config, bloqueio_garantidora_fim: '2025-01-01' }, { vencimento: '2025-06-01' }), /Período/)
  assert.equal(avaliarBloqueioGarantidora({ ...config, bloqueio_garantidora_habilitado: false }, {}).bloqueada, false)
  assert.equal(statusComBloqueioGarantidora('judicializado', false), 'judicializado')
})
test('formulários e campos ocultos conservam a data completa', async () => {
  for (const file of ['app/app/condominios/[id]/page.tsx', 'app/app/condominios/novo/page.tsx']) {
    const source = await readFile(file, 'utf8')
    assert.match(source, /name="bloqueio_garantidora_inicio" type="date"/)
    assert.match(source, /name="bloqueio_garantidora_fim" type="date"/)
    assert.doesNotMatch(source, /bloqueio_garantidora_(?:inicio|fim)[^\n]*slice\(0, 7\)/)
  }
})
test('restrição aceita dia intermediário sem perder obrigatoriedade e ordem', async () => {
  const db = new PGlite()
  try {
    await db.exec('create table condominios (bloqueio_garantidora_habilitado boolean not null, bloqueio_garantidora_inicio date, bloqueio_garantidora_fim date);')
    await db.exec(await readFile('scripts/fixtures/contratos-existentes/20261019184934_bloqueio_garantidora_datas_exatas.sql', 'utf8'))
    await db.exec("insert into condominios values (true, '2025-06-15', '2026-01-31');")
    await assert.rejects(() => db.exec("insert into condominios values (true, null, '2026-01-31');"), /check constraint/)
    await assert.rejects(() => db.exec("insert into condominios values (true, '2026-02-01', '2026-01-31');"), /check constraint/)
  } finally { await db.close() }
})
