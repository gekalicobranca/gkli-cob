import { test } from 'node:test'
import assert from 'node:assert/strict'
import { supervisorConfiguration } from './supervisor-sessions.mjs'

test('preserves existing supervisor sessions and lock', () => {
  assert.deepEqual(supervisorConfiguration(), { sessions: ['genske', 'gekali', 'azevedo'], lock: 'supervisor.lock' })
})
test('isolates the office connector and its process lock', () => {
  const office = supervisorConfiguration('escritorio')
  assert.deepEqual(office, { sessions: ['escritorio'], lock: 'supervisor-escritorio.lock' })
  assert.ok(office.sessions.every(session => !supervisorConfiguration().sessions.includes(session)))
})
test('rejects configurations that could overlap supervisors or escape file paths', () => {
  for (const value of ['', 'genske', 'escritorio,genske', '../escritorio']) {
    assert.throws(() => supervisorConfiguration(value), /Grupo de sessões inválido/)
  }
})

test('isolates Rise Up without adding it to the existing supervisors', () => {
  assert.deepEqual(supervisorConfiguration('riseup'), { sessions: ['riseup'], lock: 'supervisor-riseup.lock' })
  assert.ok(!supervisorConfiguration().sessions.includes('riseup'))
  assert.ok(!supervisorConfiguration('escritorio').sessions.includes('riseup'))
  assert.throws(() => supervisorConfiguration('riseup,gekali'))
})
