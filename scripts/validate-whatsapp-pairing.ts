import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pairingView } from '../features/mensageria/whatsapp-pairing-state'
const now = Date.parse('2026-09-28T18:00:00Z')
const control = { habilitado: true, atualizado_em: new Date(now).toISOString(), supervisor_em: new Date(now).toISOString(), reiniciar_id: 'request', aplicado_id: 'request', vinculacao_pedido: 'request', vinculacao_modo: 'codigo', vinculacao_payload: 'ABCD1234', vinculacao_expira_em: new Date(now + 180000).toISOString() }
const session = { status: 'aguardando_qr', atualizado_em: new Date(now).toISOString() }
test('só entrega código atual, válido e de worker com sinal recente', () => {
  assert.equal(pairingView(control, session, now).payload, 'ABCD1234')
  for (const patch of [{ reiniciar_id: 'new' }, { aplicado_id: 'old' }, { habilitado: false }, { supervisor_em: '2026-09-27T18:00:00Z' }, { vinculacao_expira_em: new Date(now).toISOString() }, { vinculacao_payload: '<script>' }]) assert.equal(pairingView({ ...control, ...patch }, session, now).payload, undefined)
  assert.equal(pairingView(control, { ...session, status: 'conectado' }, now).status, 'connected')
  assert.equal(pairingView(control, { ...session, atualizado_em: '2026-09-27T18:00:00Z' }, now).payload, undefined)
  assert.equal(pairingView({ ...control, vinculacao_modo: 'qr', vinculacao_payload: 'https://external.example/qr' }, session, now).payload, undefined)
  assert.equal(pairingView({ ...control, vinculacao_modo: 'qr', vinculacao_payload: 'data:image/png;base64,aGVsbG8=' }, session, now).status, 'available')
})
test('solicitação travada permite renovação após quatro minutos', () => {
  assert.equal(pairingView({ ...control, vinculacao_payload: null, atualizado_em: new Date(now - 241000).toISOString() }, session, now).status, 'expired')
})

test('falha de vinculação é imediata e não vaza para um novo pedido', () => {
  const failedSession = { ...session, status: 'vinculacao_limite' }
  assert.equal(pairingView(control, failedSession, now).status, 'failed')
  assert.match(pairingView(control, failedSession, now).message, /QR Code/)
  assert.equal(pairingView(control, failedSession, now).payload, undefined)
  assert.equal(pairingView({ ...control, aplicado_id: 'old' }, failedSession, now).status, 'waiting')
  assert.equal(pairingView({ ...control, atualizado_em: new Date(now + 1000).toISOString() }, failedSession, now).status, 'waiting')
})
test('migração preserva vinculação privada para service_role', async () => {
  const db = new PGlite()
  try {
    await db.exec('create role anon; create role authenticated; create role service_role; create table whatsapp_worker_controles(sessao text); grant all on whatsapp_worker_controles to service_role;')
    await db.exec(readFileSync(new URL('../supabase/migrations/20260928180000_whatsapp_pairing_app.sql', import.meta.url), 'utf8'))
    const result = await db.query<{ anon: boolean; authenticated: boolean; service: boolean }>("select has_table_privilege('anon','whatsapp_worker_controles','SELECT') anon, has_table_privilege('authenticated','whatsapp_worker_controles','SELECT') authenticated, has_table_privilege('service_role','whatsapp_worker_controles','SELECT') service")
    assert.deepEqual(result.rows[0], { anon: false, authenticated: false, service: true })
  } finally { await db.close() }
})
