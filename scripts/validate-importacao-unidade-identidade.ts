import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import ts from 'typescript'
import vm from 'node:vm'
import { garantirUnidadeImportacao } from '../features/unidades/importacao'
import { sincronizarResponsavelComUnidadeOperacional } from '../features/responsaveis-unidades/sync-unidade'
import { resolverCorrespondenciasUnidade } from '../lib/core/identidade-unidade'

const db = new PGlite()
const migration = readFileSync('scripts/fixtures/contratos-existentes/20261015144852_importacao_unidade_identidade_transacional.sql','utf8')
before(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table condominios(id uuid primary key,carteira_id uuid not null,nome text,nome_operacional text);
    create table unidades(id uuid primary key default gen_random_uuid(),carteira_id uuid not null,condominio_id uuid references condominios(id),identificacao text,bloco text,responsavel_nome text,responsavel_documento text,telefone text,email text,status text,observacoes text,credito_administradora numeric default 0,acao_judicial boolean default false,numero_processo text);
    create unique index unidade_exata on unidades(condominio_id,lower(trim(coalesce(bloco,''))),lower(trim(identificacao)));
    create table cobrancas(id uuid primary key default gen_random_uuid(),unidade_id uuid references unidades(id),valor numeric);
    create table acordos(id uuid primary key default gen_random_uuid(),unidade_id uuid references unidades(id),status text);
    create table historico(id uuid primary key default gen_random_uuid(),unidade_id uuid references unidades(id),descricao text);
  `)
  await db.exec(readFileSync('supabase/migrations/20260823170000_mascaras_unidade_bloco.sql','utf8').split('with mascaras(nome')[0])
  await db.exec(migration)
  await db.exec(readFileSync('scripts/fixtures/contratos-existentes/20261015172400_airport_identidade_unidade.sql','utf8'))
})
after(async () => { await db.close() })

async function condo(mask: string | null = null, blockMask: string | null = null) {
  const input = { condominio_id: randomUUID(), carteira_id: randomUUID() }
  await db.query('insert into condominios(id,carteira_id,mascara_unidade,mascara_bloco) values($1,$2,$3,$4)',[input.condominio_id,input.carteira_id,mask,blockMask])
  return input
}
const client = {
  rpc: async (_name: string, args: { p_payload: Record<string, unknown> }) => {
    try {
      const result = await db.query<{ result: unknown }>('select garantir_unidade_importacao($1::jsonb) as result',[JSON.stringify(args.p_payload)])
      return { data: result.rows[0].result, error: null }
    } catch(error) { return { data:null,error:{message:(error as Error).message} } }
  },
}
async function unit(id: string) { return (await db.query<Record<string, unknown>>('select * from unidades where id=$1',[id])).rows[0] }

test('Airport padroniza HOTEL/SUITES mantendo IDs, responsáveis e vínculos; reimportação é idempotente', async () => {
  const scope={condominio_id:'3d99c59b-5e23-497a-837d-ce5dc152708a',carteira_id:randomUUID()}
  await db.query('insert into condominios(id,carteira_id) values($1,$2)',[scope.condominio_id,scope.carteira_id])
  for(const [numero,bloco,padrao] of [['1810','HOTEL','H1810'],['2101','SUITES','S2101'],['H0406','H','H0406']]) {
    const id=randomUUID()
    await db.query('update condominios set mascara_unidade=null where id=$1',[scope.condominio_id])
    await db.query("insert into unidades(id,carteira_id,condominio_id,identificacao,bloco,responsavel_nome) values($1,$2,$3,$4,$5,'Preservar')",[id,scope.carteira_id,scope.condominio_id,numero,bloco])
    await db.query('insert into cobrancas(unidade_id,valor) values($1,123)',[id])
    await db.query("insert into acordos(unidade_id,status) values($1,'em_dia')",[id])
    await db.query("insert into historico(unidade_id,descricao) values($1,'Preservar histórico')",[id])
    await db.query("update condominios set mascara_unidade='A0000' where id=$1",[scope.condominio_id])
    for(const alias of [{identificacao:numero,bloco},{identificacao:padrao,bloco:null},{identificacao:padrao.replace(/\d+/,n=>String(Number(n))),bloco:bloco==='HOTEL'?'H':bloco==='SUITES'?'S':bloco}]) {
      assert.equal(resolverCorrespondenciasUnidade({...scope,...alias},[{...scope,identificacao:numero,bloco}]).correspondencias.length,1)
      const result=await garantirUnidadeImportacao(client,{...scope,...alias,responsavel_nome:'Não substituir'})
      assert.equal(result.id,id);assert.equal(result.criada,false)
    }
    const row=await unit(id);assert.equal(row.identificacao,padrao);assert.equal(row.bloco,null);assert.equal(row.responsavel_nome,'Preservar')
    for(const table of ['cobrancas','acordos','historico'])assert.equal((await db.query<{n:number}>(`select count(*)::int n from ${table} where unidade_id=$1`,[id])).rows[0].n,1)
  }
  for(const bad of [{identificacao:'406'},{identificacao:'H0406',bloco:'SUITES'},{identificacao:'S0406',bloco:'X'}])await assert.rejects(()=>garantirUnidadeImportacao(client,{...scope,...bad}),/Airport/)
  assert.equal((await db.query<{n:number}>('select count(*)::int n from unidades where condominio_id=$1',[scope.condominio_id])).rows[0].n,3)
})

test('equivalência HOTEL/SUITES não altera outros condomínios', async () => {
  const scope=await condo()
  assert.equal(resolverCorrespondenciasUnidade({...scope,identificacao:'2101',bloco:'SUITES'},[{...scope,identificacao:'S2101'}]).correspondencias.length,0)
  const a=await garantirUnidadeImportacao(client,{...scope,identificacao:'2101',bloco:'SUITES'})
  const b=await garantirUnidadeImportacao(client,{...scope,identificacao:'S2101'})
  assert.notEqual(a.id,b.id)
})

test('reimportação com zeros/bloco numérico reutiliza ID, preserva responsável e todos os vínculos', async () => {
  const scope=await condo('000000','0')
  const first=await garantirUnidadeImportacao(client,{...scope,identificacao:'114',bloco:'03',responsavel_nome:'Original',responsavel_documento:'12345678909',email:'original@example.com'})
  assert.equal(first.criada,true)
  await db.query('insert into cobrancas(unidade_id,valor) values($1,125)',[first.id])
  await db.query("insert into acordos(unidade_id,status) values($1,'em_dia')",[first.id])
  await db.query("insert into historico(unidade_id,descricao) values($1,'Preservar')",[first.id])
  const original=await unit(first.id)
  for(const identificacao of ['000114','114','000000114']) {
    const next=await garantirUnidadeImportacao(client,{...scope,identificacao,bloco:'3',responsavel_nome:'Outro',responsavel_documento:'98765432100',email:'outro@example.com'})
    assert.equal(next.id,first.id);assert.equal(next.criada,false)
  }
  assert.deepEqual(await unit(first.id),original)
  assert.equal(original.identificacao,'000114');assert.equal(original.bloco,'3')
  for(const table of ['cobrancas','acordos','historico'])assert.equal((await db.query<{n:number}>(`select count(*)::int n from ${table} where unidade_id=$1`,[first.id])).rows[0].n,1)
})

test('aliases de torre, garagem e quadra/lote mantêm paridade com a identidade do app', async () => {
  for(const [a,b] of [
    [{identificacao:'A00072',bloco:'0'},{identificacao:'72',bloco:'TORRE A'}],
    [{identificacao:'VG0416',bloco:'0'},{identificacao:'VG416',bloco:'GARAGEM'}],
    [{identificacao:'Q03L008',bloco:'Q03'},{identificacao:'L8',bloco:'Q3'}],
    [{identificacao:'00012',bloco:'Edifício A'},{identificacao:'12',bloco:'A'}],
  ]) {
    const scope=await condo(),first=await garantirUnidadeImportacao(client,{...scope,...a})
    assert.equal(resolverCorrespondenciasUnidade(a,[b]).correspondencias.length,1)
    assert.equal((await garantirUnidadeImportacao(client,{...scope,...b})).id,first.id)
  }
})

test('responsável intencionalmente desvinculado não é reposto pela importação', async () => {
  const scope=await condo(),first=await garantirUnidadeImportacao(client,{...scope,identificacao:'301'})
  await garantirUnidadeImportacao(client,{...scope,identificacao:'0301',bloco:'0',responsavel_nome:'Não repor',responsavel_documento:'12345678909',telefone:'5511999999999'})
  const row=await unit(first.id)
  assert.equal(row.responsavel_nome,null);assert.equal(row.responsavel_documento,null);assert.equal(row.telefone,null)
})

test('importação de responsáveis e de cobranças compartilha resolução e preserva contatos existentes', async () => {
  const scope=await condo('000000','0')
  const existing=await garantirUnidadeImportacao(client,{...scope,identificacao:'123',bloco:'1',responsavel_nome:'Dafne',telefone:'5511999999999'})
  const result=await sincronizarResponsavelComUnidadeOperacional(client,{carteiraId:scope.carteira_id,condominioId:scope.condominio_id,unidade:'000123',bloco:'01',responsavelNome:'Rodrigo',telefone:'5511888888888'})
  assert.equal(result.unidadeId,existing.id);assert.equal(result.acao,'sem_alteracao')
  assert.equal((await unit(existing.id)).responsavel_nome,'Dafne');assert.equal((await unit(existing.id)).telefone,'5511999999999')
})

test('ID antigo de prévia é resolvido novamente e ID de imóvel diferente é recusado', async () => {
  const scope=await condo(),first=await garantirUnidadeImportacao(client,{...scope,identificacao:'501',bloco:'A'})
  assert.equal((await garantirUnidadeImportacao(client,{...scope,identificacao:'000501',bloco:'A',unidade_id:randomUUID()})).id,first.id)
  const wrong=await garantirUnidadeImportacao(client,{...scope,identificacao:'502',bloco:'A'})
  await assert.rejects(()=>garantirUnidadeImportacao(client,{...scope,identificacao:'501',bloco:'A',unidade_id:wrong.id}),/prévia não corresponde/)
})

test('action real de cobranças não aceita mais o ID da prévia sem validar', async () => {
  const source=readFileSync('features/importacoes/actions.ts','utf8'),ast=ts.createSourceFile('actions.ts',source,ts.ScriptTarget.Latest,true)
  const declaration=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='garantirUnidadeDaImportacao')!
  const context=vm.createContext({garantirUnidadeImportacao,buscarResponsavelApoio:async()=>null,dadosUnidadeComApoio:(p:unknown)=>p})
  vm.runInContext(ts.transpileModule(declaration.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context)
  const scope=await condo('000000','0'),first=await garantirUnidadeImportacao(client,{...scope,identificacao:'114',bloco:'3'})
  const result=await context.garantirUnidadeDaImportacao(client,{...scope,identificacao:'000114',bloco:'03',unidade_id:randomUUID()})
  assert.equal(result.id,first.id)
})

test('bloco ausente ou sem evidência exige revisão, em vez de criar unidade solta', async () => {
  const scope=await condo()
  await garantirUnidadeImportacao(client,{...scope,identificacao:'112',bloco:'A'})
  await garantirUnidadeImportacao(client,{...scope,identificacao:'112',bloco:'B'})
  await assert.rejects(()=>garantirUnidadeImportacao(client,{...scope,identificacao:'000112'}),/evidência suficiente/)
  const reverse=await condo()
  await garantirUnidadeImportacao(client,{...reverse,identificacao:'112'})
  await assert.rejects(()=>garantirUnidadeImportacao(client,{...reverse,identificacao:'112',bloco:'A'}),/evidência suficiente/)
  assert.equal((await db.query<{n:number}>('select count(*)::int n from unidades where condominio_id=$1',[scope.condominio_id])).rows[0].n,2)
})

test('mais de um candidato bloqueia criação, mesmo com ID ou correspondência exata', async () => {
  const scope=await condo()
  await db.query("insert into unidades(carteira_id,condominio_id,identificacao,bloco) values($1,$2,'A72','0'),($1,$2,'72','TORRE A')",[scope.carteira_id,scope.condominio_id])
  await assert.rejects(()=>garantirUnidadeImportacao(client,{...scope,identificacao:'A72',bloco:'0'}),/ambígua/)
})

test('máscaras alfanuméricas, zeros significativos e unidades acima do limite', async () => {
  assert.equal((await db.query<{v:string}>("select formatar_mascara_importacao('SC103','AA0000') v")).rows[0].v,'SC0103')
  const scope=await condo('0000','0')
  const first=await garantirUnidadeImportacao(client,{...scope,identificacao:'00000301',bloco:'0'})
  assert.equal((await unit(first.id)).identificacao,'0301')
  await assert.rejects(()=>garantirUnidadeImportacao(client,{...scope,identificacao:'12345',bloco:'0'}),/máscara/)
})

test('normalizar máscara de cadastro legado não troca ID, status, crédito ou responsável', async () => {
  const scope=await condo()
  const first=await garantirUnidadeImportacao(client,{...scope,identificacao:'114',bloco:'03',responsavel_nome:'Original'})
  await db.query("update unidades set status='inativa',credito_administradora=321,acao_judicial=true where id=$1",[first.id])
  await db.query("update condominios set mascara_unidade='000000',mascara_bloco='0' where id=$1",[scope.condominio_id])
  await garantirUnidadeImportacao(client,{...scope,identificacao:'000114',bloco:'3',responsavel_nome:'Outro'})
  const row=await unit(first.id)
  assert.equal(row.identificacao,'000114');assert.equal(row.bloco,'3');assert.equal(row.status,'inativa');assert.equal(row.credito_administradora,'321');assert.equal(row.acao_judicial,true);assert.equal(row.responsavel_nome,'Original')
})

test('condomínios e carteiras distintos não são misturados', async () => {
  const a=await condo(),b=await condo()
  const left=await garantirUnidadeImportacao(client,{...a,identificacao:'1'})
  const right=await garantirUnidadeImportacao(client,{...b,identificacao:'1'})
  assert.notEqual(left.id,right.id)
  await assert.rejects(()=>garantirUnidadeImportacao(client,{...a,carteira_id:b.carteira_id,identificacao:'2'}),/fora da carteira/)
})

test('RPC invoker continua respeitando RLS e nega carteira não autorizada', async () => {
  const allowed=await condo(),forbidden=await condo()
  await db.exec(`grant usage on schema public to authenticated; grant select,insert,update on unidades,condominios to authenticated;
    alter table unidades enable row level security; alter table condominios enable row level security;
    create policy scope_unit on unidades to authenticated using(carteira_id=current_setting('test.carteira')::uuid) with check(carteira_id=current_setting('test.carteira')::uuid);
    create policy scope_cond on condominios to authenticated using(carteira_id=current_setting('test.carteira')::uuid) with check(carteira_id=current_setting('test.carteira')::uuid);`)
  await db.query("select set_config('test.carteira',$1,false)",[allowed.carteira_id])
  await db.exec('set role authenticated')
  try {
    assert.equal((await garantirUnidadeImportacao(client,{...allowed,identificacao:'1'})).criada,true)
    await assert.rejects(()=>garantirUnidadeImportacao(client,{...forbidden,identificacao:'1'}),/indisponível/)
  } finally { await db.exec('reset role') }
})

test('localiza unidade além de 500 registros e não cria outra cópia', async () => {
  const scope=await condo()
  await db.query("insert into unidades(carteira_id,condominio_id,identificacao) select $1,$2,n::text from generate_series(1,650) n",[scope.carteira_id,scope.condominio_id])
  const result=await garantirUnidadeImportacao(client,{...scope,identificacao:'000650'})
  assert.equal(result.criada,false)
  assert.equal((await unit(result.id)).identificacao,'650')
  assert.equal((await db.query<{n:number}>('select count(*)::int n from unidades where condominio_id=$1',[scope.condominio_id])).rows[0].n,650)
})

test('anon não pode executar a criação transacional', async () => {
  const result=await db.query<{allowed:boolean}>("select has_function_privilege('anon','public.garantir_unidade_importacao(jsonb)','EXECUTE') allowed")
  assert.equal(result.rows[0].allowed,false)
})
