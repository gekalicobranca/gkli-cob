import assert from 'node:assert/strict'
import { test } from 'node:test'
import { conciliarCobrancaImportada } from '../features/importacoes/cobrancas-conciliacao'
import { atualizarReciboComMarcador } from '../features/importacoes/atualizar-recibo-marcador'
import { observacoesComRecibo } from '../features/importacoes/identidade-recibo'

const row = { id: 'c', carteira_id: 'w', condominio_id: 'b', unidade_id: 'u',
  competencia: '07/2026', vencimento: '2026-07-10', valor_original: 411.23, valor_atualizado: 436.23,
  observacoes: 'Recibo 16093767 | Histórico do acordo', status: 'acordo_efetivado',
  status_financeiro: 'renegociado', status_operacional: 'acordo_efetivado', updated_at: '2026-11-19' }
const entrada = { ...row, competencia: '', observacoes: 'Recibo AE 16093767 | Posição da origem' }
function banco(rows: any[] = [{ ...row }], concorrente = false) {
  const writes: any[] = []
  return { writes, rows, from(table: string) {
    let selected = [...rows], patch: any
    const q: any = {
      select: () => q, order: () => q,
      eq: (k: string, v: unknown) => { selected = selected.filter(r => r[k] === v); return q },
      is: (k: string, v: unknown) => { selected = selected.filter(r => (r[k] ?? null) === v); return q },
      range: async (a: number, b: number) => ({ data: selected.slice(a, b + 1), error: null }),
      maybeSingle: async () => ({ data: selected[0], error: null }),
      update: (value: any) => { patch = value; return q },
      insert: (value: any) => { writes.push({ table, value }); return q },
      single: async () => ({ data: { id: 'evento' }, error: null }),
      then(resolve: any, reject: any) {
        if (patch && !concorrente) { writes.push({ table, value: patch }); selected.forEach(r => Object.assign(r, patch)) }
        return Promise.resolve({ data: concorrente ? [] : selected, error: null }).then(resolve, reject)
      },
    }; return q
  } }
}

test('caso real: AE reconhece cobrança renegociada e conserva acordo e histórico', async () => {
  const db = banco()
  const result = await conciliarCobrancaImportada(db, entrada)
  assert.equal(result.status, 'ja_existente')
  assert.equal(result.status === 'ja_existente' && result.atualizarReciboComMarcador, true)
  assert.equal(await atualizarReciboComMarcador(db, 'c', entrada), true)
  assert.equal(db.rows[0].observacoes, 'Recibo AE 16093767 | Histórico do acordo')
  assert.equal(db.rows[0].competencia, '07/2026')
  assert.equal(db.rows[0].status_financeiro, 'renegociado')
  assert.equal(db.rows[0].status_operacional, 'acordo_efetivado')
  assert.ok(db.writes.some(w => w.table === 'auditoria_eventos'))
  assert.ok(db.writes.every(w => !['acordos', 'acordo_cobrancas', 'parcelas_acordo'].includes(w.table)))
  assert.equal(await atualizarReciboComMarcador(db, 'c', entrada), false)
})

test('atualiza saldo e encargos sem alterar principal nem valores contratados', async () => {
  const db = banco()
  const input = { ...entrada, valor_atualizado: 450, juros: 30.55, multa: 8.22, correcao: 0 }
  assert.equal((await conciliarCobrancaImportada(db, input)).status, 'ja_existente')
  await atualizarReciboComMarcador(db, 'c', input)
  assert.equal(db.rows[0].valor_atualizado, 450)
  assert.equal(db.rows[0].juros, 30.55)
  assert.equal(db.rows[0].valor_original, 411.23)
  assert.deepEqual(Object.keys(db.writes[0].value).sort(), ['competencia', 'correcao', 'juros', 'multa', 'observacoes', 'valor_atualizado'])
})

test('equivalência funciona nos dois sentidos e na repetição com AE', async () => {
  for (const obs of ['Recibo 16093767', 'Recibo AE 16093767']) {
    const db = banco([{ ...row, observacoes: 'Recibo AE 16093767' }])
    const result = await conciliarCobrancaImportada(db, { ...entrada, observacoes: obs })
    assert.equal(result.status, 'ja_existente')
  }
  assert.doesNotThrow(() => observacoesComRecibo({ recibo: 'AE 16093767', observacoes: 'Recibo 16093767' }))
})

test('mantém bloqueios de situação, identidade e escopo; não escolhe duplicata', async () => {
  for (const changes of [{ valor_original: 1 }, { vencimento: '2026-07-11' },
    { observacoes: 'Recibo AJ 16093767' }, { carteira_id: 'outra' },
    { status_financeiro: 'quitado' }, { status_operacional: 'cancelado' }]) {
    const db = banco([{ ...row, ...changes }])
    const result = await conciliarCobrancaImportada(db, { ...entrada, competencia: '07/2026' })
    assert.ok(result.status !== 'ja_existente' || !result.atualizarReciboComMarcador, JSON.stringify(changes))
    await assert.rejects(atualizarReciboComMarcador(db, 'c', { ...entrada, competencia: '07/2026' }))
    assert.equal(db.writes.length, 0)
  }
  assert.equal((await conciliarCobrancaImportada(banco([{ ...row }, { ...row, id: 'dup' }]), entrada)).status, 'divergente')
})

test('alteração concorrente impede atualização e não registra sucesso', async () => {
  const db = banco([{ ...row }], true)
  await assert.rejects(atualizarReciboComMarcador(db, 'c', entrada), /alterada durante/)
  assert.equal(db.writes.length, 0)
})

test('preenche competência ausente e rejeita saldo ou encargos inválidos', async () => {
  const db = banco([{ ...row, competencia: null }])
  await atualizarReciboComMarcador(db, 'c', { ...entrada, competencia: '07/2026' })
  assert.equal(db.rows[0].competencia, '07/2026')
  for (const changes of [{ valor_atualizado: 'inválido' }, { valor_atualizado: -1 }, { juros: 'inválido' }]) {
    const invalid = banco()
    await assert.rejects(atualizarReciboComMarcador(invalid, 'c', { ...entrada, ...changes }))
    assert.equal(invalid.writes.length, 0)
  }
})

test('AE, J e ausência são metadados da ADM: todas as trocas preservam estados e acordo', async () => {
  for (const cadastrado of [null, 'A', 'AE', 'J']) {
    for (const recebido of [null, 'A', 'AE', 'J']) {
      for (const estado of ['judicializado', 'acordo_efetivado', 'suspenso', 'em_cobranca_ativa']) {
        const recibo = (m: string | null) => `Recibo ${m ? m + ' ' : ''}16093767`
        const db = banco([{ ...row, status: estado, status_operacional: estado,
          observacoes: `${recibo(cadastrado)} | Histórico judicial e do acordo` }])
        const input = { ...entrada, observacoes: recibo(recebido), valor_atualizado: 450, juros: 30.55 }
        const result = await conciliarCobrancaImportada(db, input)
        assert.equal(result.status, 'ja_existente')
        assert.equal(result.status === 'ja_existente' && result.atualizarReciboComMarcador, true)
        assert.equal(await atualizarReciboComMarcador(db, 'c', input), true)
        assert.equal(db.rows[0].status, estado)
        assert.equal(db.rows[0].status_operacional, estado)
        assert.equal(db.rows[0].status_financeiro, 'renegociado')
        assert.equal(db.rows[0].observacoes, `${recibo(cadastrado ?? recebido)} | Histórico judicial e do acordo`)
        assert.equal(db.rows[0].valor_atualizado, 450)
        assert.equal(await atualizarReciboComMarcador(db, 'c', input), false)
        assert.ok(db.writes.some(w => w.table === 'auditoria_eventos'))
        assert.ok(db.writes.every(w => !['acordos', 'acordo_cobrancas', 'parcelas_acordo'].includes(w.table)))
        assert.doesNotThrow(() => observacoesComRecibo({ recibo: recibo(recebido), observacoes: recibo(cadastrado) }))
      }
    }
  }
})

test('J não libera principal, vencimento, escopo, duplicidade nem cobranças encerradas', async () => {
  const input = { ...entrada, competencia: '07/2026', observacoes: 'Recibo J 16093767' }
  for (const changes of [{ valor_original: 1 }, { vencimento: '2026-07-11' },
    { carteira_id: 'outra' }, { status_financeiro: 'quitado' }, { status_operacional: 'cancelado' },
    { observacoes: 'Recibo AJ 16093767' }]) {
    const db = banco([{ ...row, ...changes }])
    const result = await conciliarCobrancaImportada(db, input)
    assert.ok(result.status !== 'ja_existente' || !result.atualizarReciboComMarcador)
    await assert.rejects(atualizarReciboComMarcador(db, 'c', input))
    assert.equal(db.writes.length, 0)
  }
  assert.equal((await conciliarCobrancaImportada(banco([{ ...row }, { ...row, id: 'dup' }]), input)).status, 'divergente')
})
