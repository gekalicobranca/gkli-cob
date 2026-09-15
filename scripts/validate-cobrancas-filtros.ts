import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveFiltrosStatus, STATUS_BLOQUEIOS, STATUS_OPERACIONAIS } from '../features/cobrancas/filtros-status'

test('fila inicial omite bloqueios e mantém os status operacionais', () => {
  const filtros = resolveFiltrosStatus()
  assert.equal(filtros.judicializacaoUnidade, 'nao')
  assert.equal(filtros.statusSelect, 'operacionais')
  assert.ok(filtros.statusList?.includes('novo'))
  for (const status of STATUS_BLOQUEIOS) {
    assert.ok(!filtros.statusList?.includes(status as any))
    assert.ok(!STATUS_OPERACIONAIS.includes(status as any))
  }
  assert.ok(STATUS_OPERACIONAIS.includes('acordo_firmado'))
})

test('selecionar bloqueio funciona mesmo com status operacional selecionado', () => {
  for (const status of STATUS_BLOQUEIOS) {
    for (const anterior of ['', 'operacionais', 'novo', 'todos']) {
      const filtros = resolveFiltrosStatus(anterior, status)
      assert.equal(filtros.status, '')
      assert.equal(filtros.statusList, undefined)
      assert.equal(filtros.judicializacaoUnidade, status)
    }
  }
})

test('links antigos de status bloqueado continuam acessíveis', () => {
  for (const status of STATUS_BLOQUEIOS) {
    const filtros = resolveFiltrosStatus(status)
    assert.equal(filtros.judicializacaoUnidade, status)
    assert.equal(filtros.statusSelect, 'todos')
  }
})

test('todos os status não ignora escolha de sem bloqueios', () => {
  assert.equal(resolveFiltrosStatus('todos', 'nao').judicializacaoUnidade, 'nao')
  assert.equal(resolveFiltrosStatus('todos', 'todos').statusList, undefined)
  assert.equal(resolveFiltrosStatus('operacionais', 'bloqueados').statusList, undefined)
  assert.equal(resolveFiltrosStatus('novo', 'todos').status, 'novo')
  assert.equal(resolveFiltrosStatus('invalido', 'invalido').statusSelect, 'operacionais')
})
