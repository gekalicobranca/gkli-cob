import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { classificarPendenciasMaestro, motivoExclusaoMaestro, motivoSaneamentoMaestro } from '../features/flows/cobranca/maestro-elegibilidade'

test('somente responsável e e-mail ficam pendentes, inclusive em avaliações antigas', () => {
  const motivos = [
    'Responsável não cadastrado', 'E-mail ausente ou inválido',
    'Já vinculada a outro Flow', 'Já vinculada a outro Flow de e-mail',
    'Ainda não atingiu D+30', 'Acordo vigente', 'Automação bloqueada',
    'Débito quitado ou renegociado', 'Status fora da cobrança automática', 'Falha na montagem',
  ]
  const registros = motivos.map((motivo, index) => ({ cobranca_id: String(index), motivo, saneamento: index < 2 }))
  const resultado = classificarPendenciasMaestro(registros)
  assert.deepEqual(resultado.pendencias, registros.slice(0, 2))
  assert.deepEqual(resultado.vinculadas, registros.slice(2, 4))
  assert.deepEqual(resultado.excluidas, registros.slice(4))
  assert.equal(classificarPendenciasMaestro(registros.slice(2)).pendencias.length, 0)
  assert.deepEqual(classificarPendenciasMaestro([]), { pendencias: [], vinculadas: [], excluidas: [] })
})

test('bloqueios, acordo vigente, prazo e contatos são verificados antes da montagem', () => {
  const row = { status_operacional: 'novo', status: 'novo', vencimento: '2020-01-01', status_financeiro: 'em_aberto' }
  assert.equal(motivoExclusaoMaestro(row, 30, false), null)
  for (const status of ['possivel_acordo','acordo_firmado','suspenso','judicializado']) assert.ok(motivoExclusaoMaestro({ ...row, status_operacional: status }, 30, false))
  assert.ok(motivoExclusaoMaestro(row, 30, true))
  assert.ok(motivoExclusaoMaestro({ ...row, automacao_bloqueada: true }, 30, false))
  assert.ok(motivoExclusaoMaestro({ ...row, vencimento: '2099-01-01' }, 30, false))
  assert.ok(motivoSaneamentoMaestro('', 'a@example.com'))
  assert.ok(motivoSaneamentoMaestro('Pessoa', 'invalido'))
  assert.equal(motivoSaneamentoMaestro('Pessoa', 'a@example.com'), null)
})

test('fila persiste lote, impede concorrência, retoma lease e finaliza sem ativar envios', async () => {
  const db = new PGlite()
  const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table agente_execucoes(id uuid primary key); create table conversoes_relatorio(id uuid primary key);
    create table carteiras(id uuid primary key); create table condominios(id uuid primary key,carteira_id uuid,status text);
    create table reguas(id uuid primary key);
    create table lotes(id uuid primary key default gen_random_uuid(),carteira_id uuid,regua_id uuid,tipo text,status text,iniciado_em timestamptz,observacoes text);
    create table cobranca_flows(id uuid primary key default gen_random_uuid(),carteira_id uuid,lote_id uuid unique,regua_id uuid,nome text,status text,total_mensagens int,total_pendentes int,total_falhas int,payload jsonb);
    create table cobrancas(id uuid primary key,carteira_id uuid,condominio_id uuid,status text,status_operacional text,status_financeiro text,automacao_bloqueada bool default false);
    create table acordos(cobranca_id uuid,status text);
    create table mensagens(id uuid primary key,lote_id uuid,cobranca_id uuid,status text,cobranca_flow_id uuid,agendada_para timestamptz,scheduled_at timestamptz);
    create table lote_itens(lote_id uuid,cobranca_id uuid,status text,cobranca_flow_id uuid,motivo text);
  `)
  const sql = readFileSync('supabase/migrations/20260917140000_maestro_flow_montagens.sql','utf8').split('create function public.maestro_flow_tick()')[0]
  await db.exec(sql + 'commit;')
  await db.exec(`insert into agente_execucoes values('${id(1)}'); insert into conversoes_relatorio values('${id(2)}'),('${id(20)}'); insert into carteiras values('${id(3)}'); insert into condominios values('${id(4)}','${id(3)}','ativo'); insert into reguas values('${id(5)}');`)
  await db.query(`insert into maestro_flow_montagens(execucao_id,conversao_id,carteira_id,condominio_id,regua_id,plano) values($1,$2,$3,$4,$5,$6::jsonb)`, [id(1),id(2),id(3),id(4),id(5),JSON.stringify([[id(6)],[id(7)]])])
  const first = (await db.query<any>('select * from maestro_flow_claim()')).rows[0]
  assert.equal((await db.query('select * from maestro_flow_claim()')).rows.length, 0)
  const lote = (await db.query<any>('select maestro_flow_lote($1,$2) id',[first.id,first.token])).rows[0].id
  assert.equal((await db.query<any>('select maestro_flow_lote($1,$2) id',[first.id,first.token])).rows[0].id,lote)
  await db.query(`update maestro_flow_montagens set lease_ate=now()-interval '1 minute' where id=$1`,[first.id])
  const resumed = (await db.query<any>('select * from maestro_flow_claim()')).rows[0]
  assert.equal(resumed.lote_id,lote)
  assert.notEqual(resumed.token,first.token)
  await assert.rejects(db.query('select maestro_flow_finalizar($1,$2,$3)',[first.id,first.token,'Inválido']), /expirada/)
  await db.query(`insert into cobrancas(id,carteira_id,condominio_id,status,status_operacional,status_financeiro) values($1,$2,$3,'novo','novo','em_aberto')`,[id(6),id(3),id(4)])
  await db.query(`insert into mensagens(id,lote_id,cobranca_id,status) values($1,$2,$3,'pendente_aprovacao')`,[id(8),lote,id(6)])
  await db.query(`insert into lote_itens(lote_id,cobranca_id,status) values($1,$2,'criado')`,[lote,id(6)])
  await db.query(`insert into acordos values($1,'ativo')`,[id(6)])
  await assert.rejects(db.query('select maestro_flow_finalizar($1,$2,$3)',[first.id,resumed.token,'Teste']), /bloqueada/)
  assert.equal((await db.query('select * from cobranca_flows')).rows.length,0)
  await db.exec('delete from acordos')
  const flow = (await db.query<any>('select maestro_flow_finalizar($1,$2,$3) id',[first.id,resumed.token,'Teste'])).rows[0].id
  assert.equal((await db.query<any>('select status from cobranca_flows')).rows[0].status,'pronto')
  const msg = (await db.query<any>('select * from mensagens')).rows[0]
  assert.equal(msg.status,'pendente_aprovacao'); assert.equal(msg.cobranca_flow_id,flow); assert.equal(msg.agendada_para,null)
  const job = (await db.query<any>('select * from maestro_flow_montagens')).rows[0]
  assert.equal(job.parte,1); assert.equal(job.status,'pendente'); assert.equal(job.lote_id,null)
  await assert.rejects(db.query('select maestro_flow_finalizar($1,$2,$3)',[first.id,resumed.token,'Duplicado']), /expirada/)
  assert.equal((await db.query('select * from cobranca_flows')).rows.length,1)
  await db.close()
})
