import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServerClock } from './server-clock.mjs'

test('heartbeat acompanha o servidor mesmo com computador adiantado e avança entre respostas', async () => {
  const server = Date.parse('2026-10-21T15:18:00Z')
  let local = server + 85_000
  const clock = createServerClock({ now: () => local,
    fetcher: async () => new Response('', { headers: { date: new Date(server).toUTCString() } }) })
  await clock.fetch('https://example.invalid')
  assert.equal(clock.now(), server)
  local += 10_000
  assert.equal(clock.iso(), '2026-10-21T15:18:10.000Z')
})

test('resposta sem data não corrompe a última sincronização', async () => {
  const clock = createServerClock({ now: () => 1000, fetcher: async () => new Response('') })
  await clock.fetch('https://example.invalid')
  assert.equal(clock.now(), 1000)
})
