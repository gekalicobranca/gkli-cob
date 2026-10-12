import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { execucoesDaUrl, modoManual, reivindicarManual, abrirTrava, esperarTrava } from './manual.mjs'
import { iniciarExecucoes } from './manual-launcher.mjs'

const id = '11111111-1111-4111-8111-111111111111'
const outro = '22222222-2222-4222-8222-222222222222'

test('aceita somente o protocolo e a lista limitada de execuções', () => {
  assert.deepEqual(execucoesDaUrl(`gkli-acordos://executar?ids=${id},${id},${outro}`), [id, outro])
  for (const url of [`https://executar?ids=${id}`, `gkli-acordos://outro?ids=${id}`, `gkli-acordos://executar/script?ids=${id}`, `gkli-acordos://executar?ids=${id}&script=node`, `gkli-acordos://executar?ids=${id}&ids=${outro}`, `gkli-acordos://executar?ids=${id}#fragmento`, 'gkli-acordos://executar?ids=;powershell', `gkli-acordos://executar?ids=${Array(101).fill(id).join(',')}`]) assert.throws(() => execucoesDaUrl(url))
  assert.equal(modoManual([]), null)
  assert.deepEqual(modoManual(['--execucoes', id]), [id])
  assert.throws(() => modoManual(['--execucoes', '']))
  assert.throws(() => modoManual(['--todos']))
})

test('reivindicação manual restringe ID, portal, origem e status; clique repetido não duplica', async () => {
  const rows = [{ id, administradora: 'Lello', origem: 'manual', status: 'pendente' }, { id: outro, administradora: 'Lello', origem: 'manual', status: 'pendente' }]
  let chamadas = 0
  const db = createClient('https://example.invalid', 'test-key', { global: { fetch: async (url, options) => {
    chamadas++
    assert.equal(options.method, 'PATCH')
    const query = new URL(url).searchParams
    assert.equal(query.get('id'), `eq.${id}`)
    assert.equal(query.get('administradora'), 'eq.Lello')
    assert.equal(query.get('origem'), 'eq.manual')
    assert.equal(query.get('status'), 'eq.pendente')
    const matching = rows.filter(r => r.id === id && r.status === 'pendente')
    matching.forEach(r => Object.assign(r, JSON.parse(options.body)))
    return new Response(JSON.stringify(matching), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } }, auth: { persistSession: false } })
  const selecionadas = [id]
  assert.equal((await reivindicarManual(db, selecionadas, 'Lello', 'worker')).id, id)
  assert.equal(await reivindicarManual(db, [id], 'Lello', 'worker-2'), null)
  assert.equal(await reivindicarManual(db, selecionadas, 'Lello', 'worker'), null)
  assert.equal(chamadas, 2)
  assert.equal(rows[0].worker_id, 'worker')
  assert.equal(rows[1].status, 'pendente')
  assert.equal(selecionadas.length, 0)
})

test('trava preserva processo ativo e permite nova execução após liberar', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'acordos-manual-'))
  const arquivo = path.join(dir, '.fila.lock')
  try {
    const primeira = await abrirTrava(arquivo, { pid: process.pid })
    await assert.rejects(abrirTrava(arquivo, { pid: process.pid }), { code: 'EXECUTOR_OCUPADO' })
    await assert.rejects(esperarTrava(arquivo, { pid: process.pid }, true, 0), { code: 'EXECUTOR_OCUPADO' })
    assert.equal(JSON.parse(await readFile(arquivo, 'utf8')).pid, process.pid)
    await primeira.close(); await unlink(arquivo)
    const segunda = await abrirTrava(arquivo, { pid: process.pid })
    await segunda.close(); await unlink(arquivo)
    await writeFile(arquivo, JSON.stringify({ pid: -1 }))
    await assert.rejects(abrirTrava(arquivo, { pid: process.pid }), /Trava inválida/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('inicializador abre apenas os portais selecionados e termina sem consultar fila novamente', async () => {
  const chamadas = []
  const db = createClient('https://example.invalid', 'test-key', { global: { fetch: async url => {
    const query = new URL(url).searchParams
    assert.equal(query.get('id'), `in.(${id},${outro})`)
    assert.equal(query.get('status'), 'eq.pendente')
    assert.equal(query.get('origem'), 'eq.manual')
    return new Response(JSON.stringify([{ id, administradora: 'Manager' }, { id: outro, administradora: 'Lello' }]), { headers: { 'Content-Type': 'application/json' } })
  } }, auth: { persistSession: false } })
  assert.equal(await iniciarExecucoes([id, outro], { db, executar: async (bin, args, options) => {
    chamadas.push(args)
    assert.equal(bin, process.execPath)
    assert.equal(options.windowsHide, true)
    assert.ok(args.includes('--execucoes'))
    return { stdout: 'concluído' }
  }, log: { log() {}, error() {} } }), 0)
  assert.deepEqual(chamadas.map(args => args.at(-1)), [id, outro])
  assert.ok(chamadas[0].includes('scripts/manager-acordos/fila.mjs'))
  assert.ok(chamadas[1].includes('lello'))
})

test('pedido já finalizado não inicia nenhum processo local', async () => {
  const db = createClient('https://example.invalid', 'test-key', { global: { fetch: async () => new Response('[]', { headers: { 'Content-Type': 'application/json' } }) }, auth: { persistSession: false } })
  assert.equal(await iniciarExecucoes([id], { db, executar: async () => assert.fail('Não deve iniciar processo sem pedido pendente.') }), 0)
})
