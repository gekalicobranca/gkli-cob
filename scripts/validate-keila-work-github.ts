import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import * as XLSX from 'xlsx'
import { dispararWorkKeila, periodoWorkKeila } from '../features/keila/work-github'
import { validarRelatorioWork } from '../features/keila/work-entrega'

const caso = '10000000-0000-4000-8000-000000000001'
const execucao = '10000000-0000-4000-8000-000000000002'
const condominio = '10000000-0000-4000-8000-000000000003'
const carteira = '10000000-0000-4000-8000-000000000004'
const hash = '1'.repeat(64)

async function testar() {
  const periodo = periodoWorkKeila('2026-11-23T13:00:00Z')
  assert.deepEqual(periodo, { de: '23/11/2021', ate: '23/11/2026' })
  assert.deepEqual(periodoWorkKeila('2024-03-01T01:00:00Z'), { de: '28/02/2019', ate: '29/02/2024' })

  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['Cotas Atrasadas '], ['182 - BOSQUE MARAJOARA'], [`${periodo.de} até ${periodo.ate}`],
  ]), 'Inadimplentes')
  const arquivo = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
  validarRelatorioWork(arquivo, '00182', 'CONDOMINIO BOSQUE MARAJOARA', periodo)
  assert.throws(() => validarRelatorioWork(arquivo, '183', 'CONDOMINIO BOSQUE MARAJOARA', periodo), /outro condomínio/)
  assert.throws(() => validarRelatorioWork(arquivo, '182', 'CONDOMINIO BOSQUE MARAJOARA', { ...periodo, ate: '24/11/2026' }), /período/)
  if (process.argv[2]) validarRelatorioWork(await readFile(process.argv[2]), '182', 'CONDOMINIO BOSQUE MARAJOARA', periodo)

  process.env.KEILA_WORK_GITHUB_TOKEN = 'token-ficticio'
  let encontrouPR = false
  let envios = 0
  const github: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    assert.equal(url.origin, 'https://api.github.com')
    if (url.pathname.endsWith('/pulls') && !init?.method) {
      assert.match(url.searchParams.get('head') ?? '', new RegExp(execucao))
      return Response.json(encontrouPR ? [{ number: 70, state: 'open' }] : [])
    }
    if (url.pathname.endsWith('/git/refs')) {
      assert.match(JSON.parse(String(init?.body)).ref, new RegExp(execucao))
      return Response.json({}, { status: 201 })
    }
    envios++
    const dados = JSON.parse(String(init?.body))
    assert.equal(dados.title, `[KEILA-WORK-PILOTO-20261123] Coleta ${execucao}`)
    assert.equal(dados.draft, true)
    encontrouPR = true
    return Response.json({ number: 70 }, { status: 201 })
  }
  assert.equal(await dispararWorkKeila(execucao, github), 70)
  assert.equal(await dispararWorkKeila(execucao, github), 70)
  assert.equal(envios, 1)

  const db = new PGlite()
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema storage;
      create table storage.buckets (id text primary key, public boolean);
      create table storage.objects (bucket_id text, name text, metadata jsonb);
      create table public.central_pendencias (
        id uuid primary key, tipo text, status text, condominio_id uuid, carteira_id uuid, payload jsonb
      );
      create table public.agente_execucoes (
        id uuid primary key, origem text, status text check (status in ('pendente','sucesso')),
        carteira_id uuid, condominio_id uuid, finalizado_em timestamptz, erro_mensagem text
      );
      create table public.agente_arquivos (
        id uuid primary key default gen_random_uuid(), execucao_id uuid references public.agente_execucoes(id),
        nome_arquivo text, tipo_arquivo text, storage_path text, tamanho_bytes bigint, hash_arquivo text, status_validacao text
      );
      create table public.agente_logs (execucao_id uuid, step text, nivel text, mensagem text);
    `)
    await db.exec(await readFile('supabase/migrations/20261123212134_keila_work_github.sql', 'utf8'))
    await db.exec(`
      insert into central_pendencias values
        ('${caso}','keila_atendimento','em_tratamento','${condominio}','${carteira}','{"execucao_id":"${execucao}","estado":"buscando_debitos"}');
      insert into agente_execucoes(id,origem,status,carteira_id,condominio_id,work_caso_id) values
        ('${execucao}','work_github','aguardando_work','${carteira}','${condominio}','${caso}');
      insert into storage.buckets values ('agente-relatorios',false);
    `)
    const anexar = (caseId = caso, sha = hash) => db.query<{ id: string }>(
      'select public.keila_work_anexar($1,$2,$3,$4,$5,$6) as id',
      [execucao, caseId, 'Cotas_Atrasadas_Lello.xlsx', 'application/octet-stream', sha, 10146],
    )
    await assert.rejects(anexar(), /armazenamento privado/)
    await db.query('insert into storage.objects values ($1,$2,$3)', [
      'agente-relatorios', `${execucao}/${hash}.xlsx`, JSON.stringify({ size: 10146 }),
    ])
    await assert.rejects(anexar(condominio), /fora do atendimento/)
    const primeiro = await anexar()
    assert.ok(primeiro.rows[0]?.id)
    assert.deepEqual(await anexar(), primeiro)
    await assert.rejects(anexar(caso, '2'.repeat(64)), /indisponível/)
    const { rows } = await db.query(`
      select e.status, a.status_validacao, p.payload->>'execucao_id' as execucao_id
      from central_pendencias p join agente_execucoes e on e.work_caso_id = p.id
      join agente_arquivos a on a.execucao_id = e.id
    `)
    assert.deepEqual(rows, [{ status: 'sucesso', status_validacao: 'aguardando_validacao', execucao_id: execucao }])
  } finally {
    await db.close()
  }
  console.log('Piloto Keila Work: disparo idempotente, XLSX e devolução transacional verificados.')
}

testar().catch(error => { console.error(error); process.exitCode = 1 })
