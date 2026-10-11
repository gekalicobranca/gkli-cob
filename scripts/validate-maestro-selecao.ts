import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
test('ações em massa isolam seleção e carteira, preservam histórico e recusam montagens em processamento', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      create table profiles(id uuid,role text);
      create function current_user_can_access_carteira(c uuid) returns boolean language sql as $$ select c='${id(10)}'::uuid $$;
      create table condominios(id uuid primary key,carteira_id uuid,captacao_automatica_habilitada boolean,updated_at timestamptz);
      create table agente_execucoes(id uuid primary key,condominio_id uuid,status text,origem text,agendado_para timestamptz,finalizado_em timestamptz,erro_mensagem text);
      create table maestro_flow_montagens(id uuid primary key,carteira_id uuid,status text,arquivado_em timestamptz,token uuid,lease_ate timestamptz,erro text,updated_at timestamptz,flow_ids uuid[]);
      insert into profiles values('${id(1)}','operador');
      insert into condominios values('${id(2)}','${id(10)}',true,null),('${id(3)}','${id(10)}',true,null),('${id(4)}','${id(11)}',true,null);
      insert into agente_execucoes(id,condominio_id,status,origem) values
        ('${id(20)}','${id(2)}','pendente','agenda_mensal'),
        ('${id(21)}','${id(2)}','pendente','manual'),
        ('${id(22)}','${id(2)}','em_execucao','agenda_mensal'),
        ('${id(23)}','${id(3)}','pendente','agenda_mensal');
      insert into maestro_flow_montagens(id,carteira_id,status,flow_ids) values
        ('${id(30)}','${id(10)}','pendente',array['${id(90)}'::uuid]),
        ('${id(31)}','${id(10)}','processando',null),
        ('${id(32)}','${id(11)}','pendente',null);
    `)
    await db.exec(readFileSync('supabase/migrations/20261011160304_maestro_pausar_agendas_selecionadas.sql', 'utf8'))
    await assert.rejects(db.query('select maestro_pausar_agendas($1::uuid[])', [[id(2)]]), /Sem permissão/)
    await db.query("select set_config('test.uid',$1,false)", [id(1)])
    await assert.rejects(db.query('select maestro_pausar_agendas($1::uuid[])', [[]]), /Selecione/)
    await assert.rejects(db.query('select maestro_pausar_agendas($1::uuid[])', [[id(2),id(4)]]), /sem permissão/)
    assert.equal((await db.query<any>('select captacao_automatica_habilitada as ativa from condominios where id=$1',[id(2)])).rows[0].ativa,true)
    const resultado = (await db.query<any>('select maestro_pausar_agendas($1::uuid[]) as r', [[id(2),id(2)]])).rows[0].r
    assert.deepEqual(resultado, { pausadas: 1, canceladas: 1 })
    const execucoes = (await db.query<any>('select status from agente_execucoes order by id')).rows.map(r => r.status)
    assert.deepEqual(execucoes, ['cancelada','pendente','em_execucao','pendente'])
    assert.equal((await db.query<any>('select captacao_automatica_habilitada as ativa from condominios where id=$1',[id(3)])).rows[0].ativa,true)
    await assert.rejects(db.query('select maestro_limpar_montagens($1::uuid[])', [[id(30),id(31)]]), /não está mais pendente/)
    await assert.rejects(db.query('select maestro_limpar_montagens($1::uuid[])', [[id(32)]]), /sem permissão/)
    assert.equal((await db.query<any>('select status from maestro_flow_montagens where id=$1',[id(30)])).rows[0].status,'pendente')
    assert.equal((await db.query<any>('select maestro_limpar_montagens($1::uuid[]) as n',[[id(30)]])).rows[0].n,1)
    const job = (await db.query<any>('select status,arquivado_em,flow_ids from maestro_flow_montagens where id=$1',[id(30)])).rows[0]
    assert.equal(job.status,'concluido')
    assert.ok(job.arquivado_em)
    assert.deepEqual(job.flow_ids,[id(90)])
    assert.equal((await db.query<any>("select has_function_privilege('anon','maestro_limpar_montagens(uuid[])','execute') as permitido")).rows[0].permitido,false)
  } finally { await db.close() }
})
