import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { statusOperacionalParaCobrancaImportada } from '../features/importacoes/status-cobranca-importada'
import { motivoExclusaoMaestro } from '../features/flows/cobranca/maestro-elegibilidade'

const migration = readFileSync('supabase/migrations/20261013151309_unidade_judicial_informativa_follow_60_dias.sql','utf8')
test('importação não herda judicialização da unidade e respeita D+60', async () => {
  const tables: string[] = []
  const db = { from(table: string) {
    tables.push(table)
    assert.equal(table, 'condominios')
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { inicio_cobranca_dias:60, dias_apos_vencimento_regua:60 }, error:null }) }) }) }
  } }
  assert.equal(await statusOperacionalParaCobrancaImportada(db, { unidade_id:'judicial', condominio_id:'follow', vencimento:'2020-01-01' }), 'novo')
  assert.equal(await statusOperacionalParaCobrancaImportada(db, { unidade_id:'judicial', condominio_id:'follow', vencimento:'2099-01-01' }), 'regular')
  assert.deepEqual(tables, ['condominios','condominios'])
  const row = { status:'novo', status_operacional:'novo', status_financeiro:'em_aberto', vencimento:'2020-01-01', unidades:{ acao_judicial:true } }
  assert.equal(motivoExclusaoMaestro(row,60,false),null)
  assert.equal(motivoExclusaoMaestro({...row,status:'judicializado'},60,false),'Status fora da cobrança automática')
})

test('banco separa cobrança judicial, débito novo e mensagens da mesma unidade', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create table unidades(id uuid primary key,acao_judicial boolean default false);
      create table condominios(id uuid primary key,inicio_cobranca_dias int,dias_apos_vencimento_regua int);
      create table cobrancas(id uuid primary key,unidade_id uuid,condominio_id uuid,status text,status_operacional text,status_financeiro text,automacao_bloqueada boolean default false,duplicada_de_id uuid);
      create table acordos(id uuid primary key,unidade_id uuid,cobranca_id uuid,tipo text,numero_processo text);
      create table mensagens(id uuid primary key,cobranca_id uuid,cobranca_flow_id uuid,payload jsonb,status text);
      create table pre_juridico_casos(id uuid primary key,unidade_id uuid,cobranca_id uuid,distribuicao_status text,etapa text);
      create function mensagem_contem_cobranca_arquivada(m mensagens) returns boolean language sql as $$ select false $$;
      create function flow_cancelar_mensagem(p_id uuid) returns void language sql as $$ update mensagens set status='cancelada' where id=p_id $$;
      create function agente_virtual_negociar_acordo(text,uuid,uuid,text,jsonb,text) returns jsonb language plpgsql as $$
        declare un unidades; begin select * into un from unidades limit 1;
        if not found or un.acao_judicial then raise exception 'Unidade inválida ou judicializada.'; end if; return '{}'::jsonb; end $$;
    `)
    const old = readFileSync('supabase/migrations/20260918150000_flow_bloqueio_status.sql','utf8')
    const eligible = old.slice(old.indexOf('create or replace function public.flow_cobranca_mensagem_elegivel'), old.indexOf('create or replace function public.flow_cancelar_mensagem'))
    const cancel = old.slice(old.indexOf('create or replace function public.flow_cancelar_apos_status_cobranca'),old.indexOf('-- Check inside'))
    await db.exec(eligible + cancel)
    await db.exec(readFileSync('supabase/migrations/20260817221832_unidade_acao_judicial.sql','utf8'))
    await db.exec(migration)
    await db.exec(`
      create trigger sincronizar after update on pre_juridico_casos for each row execute function sincronizar_judicializacao_pre_juridico();
      insert into unidades values('00000000-0000-0000-0000-000000000001',true);
      insert into cobrancas values
      ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001',null,'em_cobranca_ativa','em_cobranca_ativa','em_aberto',false,null),
      ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',null,'judicializado','judicializado','em_aberto',false,null);
      insert into mensagens values
      ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000005','{}','pendente_aprovacao'),
      ('00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000005','{}','pendente_aprovacao');
    `)
    assert.deepEqual((await db.query('select flow_cobranca_mensagem_elegivel(m) as ok from mensagens m order by id')).rows,[{ok:true},{ok:false}])
    await db.exec(`update unidades set acao_judicial=false; update unidades set acao_judicial=true;`)
    assert.equal((await db.query<{status:string}>('select status from cobrancas order by id')).rows[0].status,'em_cobranca_ativa')
    await db.exec(`insert into acordos values('00000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','extrajudicial',null)`)
    await assert.rejects(db.exec(`insert into acordos values('00000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','extrajudicial',null)`), /Cobrança judicializada/)
    await db.exec(`update cobrancas set status='suspenso' where id='00000000-0000-0000-0000-000000000003'`)
    assert.deepEqual((await db.query('select status from mensagens order by id')).rows,[{status:'pendente_aprovacao'},{status:'cancelada'}])
    await db.exec(`
      insert into pre_juridico_casos values('00000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003',null,'pronto_juridico');
      update pre_juridico_casos set distribuicao_status='distribuido';
    `)
    assert.deepEqual((await db.query('select status from cobrancas order by id')).rows,[{status:'em_cobranca_ativa'},{status:'judicializado'}])
  } finally { await db.close() }
})
