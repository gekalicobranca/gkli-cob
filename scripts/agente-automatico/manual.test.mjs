import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { PGlite } from '@electric-sql/pglite'
import { createClient } from '@supabase/supabase-js'
import { coletorManual, execucaoDaUrlMaestro, urlExecutorMaestro } from '../../features/agente-automatico/executor-manual.mjs'
import { somenteExecucoesLiberadas } from './execucoes-agendadas.mjs'
import { concluirExecucaoMaestro } from './concluir-maestro.mjs'
import { executarPedidoMaestro } from './manual-launcher.mjs'
import { validarIdentidadeSell, retornoSemInadimplenciaSell } from './sell-validacao.mjs'

const id = '11111111-1111-4111-8111-111111111111'
const outro = '22222222-2222-4222-8222-222222222222'

test('protocolo valida destino e ID sem permitir comandos ou outro coletor', () => {
  assert.equal(execucaoDaUrlMaestro(urlExecutorMaestro(id)), id)
  for (const url of [`https://executar?id=${id}`, `gkli-maestro://outro?id=${id}`, `gkli-maestro://executar?id=${id}&script=cmd`, `gkli-maestro://executar?id=${id}&id=${outro}`, 'gkli-maestro://executar?id=;powershell']) assert.throws(() => execucaoDaUrlMaestro(url))
  assert.equal(coletorManual('captacao_sell'), 'worker-sell.mjs')
  assert.throws(() => coletorManual('captacao_habitacional'), /ainda não está disponível/)
  assert.throws(() => coletorManual('toString'))
})

test('modo manual filtra o ID e exclui agendas mesmo com captação automática pausada', () => {
  const anterior = process.env.AGENTE_EXECUCAO_ID
  process.env.AGENTE_EXECUCAO_ID = id
  try {
    const filtros = []
    const query = { eq(...args) { filtros.push(['eq', ...args]); return this }, is(...args) { filtros.push(['is', ...args]); return this }, in(...args) { filtros.push(['in', ...args]); return this } }
    assert.equal(somenteExecucoesLiberadas(query, new Date(), false), query)
    assert.deepEqual(filtros, [['eq', 'id', id], ['is', 'agendado_para', null], ['in', 'origem', ['maestro', 'manual']]])
    process.env.AGENTE_EXECUCAO_ID = 'invalido'
    assert.throws(() => somenteExecucoesLiberadas(query))
  } finally { if (anterior === undefined) delete process.env.AGENTE_EXECUCAO_ID; else process.env.AGENTE_EXECUCAO_ID = anterior }
})

test('pedido finalizado não inicia navegador nem outro agente', async () => {
  const db = createClient('https://example.invalid', 'test-key', { global: { fetch: async url => {
    assert.equal(new URL(url).searchParams.get('id'), `eq.${id}`)
    return Response.json({ id, status: 'sucesso', origem: 'maestro' })
  } }, auth: { persistSession: false } })
  assert.equal(await executarPedidoMaestro(id, { db, executar: async () => assert.fail('Não deve iniciar outro agente.') }), false)
})

test('executor inicia um único coletor com ID e encerramento obrigatórios, até o flow concluído', async () => {
  const pasta = await mkdtemp(path.join(os.tmpdir(), 'maestro-executor-test-'))
  let iniciou = 0
  const db = createClient('https://example.invalid', 'test-key', { global: { fetch: async (url, options) => {
    const u = new URL(url)
    const tabela = u.pathname.split('/').at(-1)
    if (tabela === 'agente_execucoes') {
      assert.equal(u.searchParams.get('id'), `eq.${id}`)
      return Response.json(u.searchParams.get('select').includes('receita:') ? { id, origem: 'maestro', status: 'pendente', receita: { script_key: 'captacao_sell', ativo: true } } : { status: 'sucesso' })
    }
    if (tabela === 'maestro_flow_montagens') { assert.equal(u.searchParams.get('execucao_id'), `eq.${id}`); return Response.json({ status: 'concluido' }) }
    if (tabela === 'agente_logs') return Response.json([])
    if (tabela === 'agente_workers') { assert.equal(options.method, 'DELETE'); return Response.json([]) }
    assert.fail(`Tabela inesperada: ${tabela}`)
  } }, auth: { persistSession: false } })
  try {
    assert.equal(await executarPedidoMaestro(id, { db, pastaTravas: pasta, executar: async (bin, args, options) => {
      iniciou++
      assert.equal(bin, process.execPath)
      assert.equal(options.env.AGENTE_EXECUCAO_ID, id)
      assert.equal(options.env.AGENTE_RUN_ONCE, 'true')
      assert.equal(options.windowsHide, true)
      assert.ok(args.at(-1).endsWith('worker-sell.mjs'))
      return { stdout: '' }
    } }), true)
    assert.equal(iniciou, 1)
  } finally { await rm(pasta, { recursive: true, force: true }) }
})

test('conclusão manual aguarda montagem e não invoca processamento global ou envio', async () => {
  const anteriores = { id: process.env.AGENTE_EXECUCAO_ID, url: process.env.CAPTACAO_MAESTRO_URL, secret: process.env.CAPTACAO_ORQUESTRADOR_SECRET }
  process.env.AGENTE_EXECUCAO_ID = id
  process.env.CAPTACAO_MAESTRO_URL = 'https://maestro.invalid'
  process.env.CAPTACAO_ORQUESTRADOR_SECRET = 'test-secret'
  try {
    const chamadas = []
    const db = { from() { return { select() { return this }, eq() { return this }, async single() { return { data: { origem: 'maestro' }, error: null } } } } }
    assert.equal(await concluirExecucaoMaestro(db, id, async (url, options) => {
      chamadas.push(url)
      assert.equal(options.method, 'POST')
      assert.ok(url.includes(`/execucoes/${id}/`))
      return Response.json(url.endsWith('/concluir') ? { ok: true } : { ok: true, montagem: { status: 'concluido', flow_ids: [outro] } })
    }), true)
    assert.deepEqual(chamadas.map(u => u.split('/').at(-1)), ['concluir', 'montar-flow'])
    await assert.rejects(concluirExecucaoMaestro(db, id, async url => Response.json(url.endsWith('/concluir') ? { ok: true } : { ok: true, montagem: { status: 'atencao', erro: 'Contato pendente' } })), /Contato pendente/)
  } finally {
    for (const [chave, valor] of [['AGENTE_EXECUCAO_ID', anteriores.id], ['CAPTACAO_MAESTRO_URL', anteriores.url], ['CAPTACAO_ORQUESTRADOR_SECRET', anteriores.secret]]) { if (valor === undefined) delete process.env[chave]; else process.env[chave] = valor }
  }
})

test('SELL só reconhece ausência de inadimplência no retorno autenticado ao condomínio confirmado', () => {
  const titulo = 'EDIFICIO PARC EXCLUSIF PERDIZES'
  assert.equal(retornoSemInadimplenciaSell('https://servc9.webware.com.br/bin/skin/aInicioSkin.asp', titulo, titulo, true), true)
  assert.equal(retornoSemInadimplenciaSell('https://selladm.com.br/', titulo, titulo, true), false)
  assert.equal(retornoSemInadimplenciaSell('https://servc9.webware.com.br/bin/skin/aInicioSkin.asp', titulo, titulo, false), false)
  assert.throws(() => validarIdentidadeSell('OUTRO CONDOMINIO', titulo))
  assert.throws(() => validarIdentidadeSell(titulo, ''))
})

test('montagem manual reivindica apenas a execução escolhida, sem tocar nas agendas e com RPC restrito', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table agente_execucoes(id uuid primary key,origem text,agendado_para timestamptz);
      create table maestro_flow_montagens(id uuid primary key,execucao_id uuid,condominio_id uuid,status text,erro text,updated_at timestamptz,lease_ate timestamptz,tentativas int default 0,token uuid);
      insert into agente_execucoes values('${id}','maestro',null),('${outro}','agenda_mensal',now());
      insert into maestro_flow_montagens(id,execucao_id,condominio_id,status,updated_at) values('${id}','${id}','${id}','pendente',now()),('${outro}','${outro}','${outro}','pendente',now()-interval '1 day');`)
    await db.exec(await readFile(new URL('../../supabase/migrations/20261013142420_maestro_montagem_manual_por_execucao.sql', import.meta.url), 'utf8'))
    const primeira = await db.query(`select * from maestro_flow_claim_execucao('${id}')`)
    assert.equal(primeira.rows[0].id, id)
    assert.equal((await db.query(`select * from maestro_flow_claim_execucao('${id}')`)).rows.length, 0)
    assert.equal((await db.query(`select * from maestro_flow_claim_execucao('${outro}')`)).rows.length, 0)
    assert.equal((await db.query(`select status from maestro_flow_montagens where id='${outro}'`)).rows[0].status, 'pendente')
    const permissoes = await db.query(`select has_function_privilege('anon','maestro_flow_claim_execucao(uuid)','execute') as anon,has_function_privilege('authenticated','maestro_flow_claim_execucao(uuid)','execute') as usuario,has_function_privilege('service_role','maestro_flow_claim_execucao(uuid)','execute') as servico`)
    assert.deepEqual(permissoes.rows[0], { anon: false, usuario: false, servico: true })
  } finally { await db.close() }
})
