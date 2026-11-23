import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('limpeza respeita corte, estado, origem, evidências, pausa e repetição', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema cron;
      create table cron.job(nome text, agenda text, comando text);
      create function cron.schedule(text,text,text) returns void language sql as 'insert into cron.job values($1,$2,$3)';
      create table profiles(id uuid primary key);
      create table agente_execucoes(id int primary key, carteira_id uuid, status text default 'pendente',
        origem text default 'maestro', tentativas int default 0, iniciado_em timestamptz, finalizado_em timestamptz,
        erro_mensagem text, easy_maestro_lote_id uuid, created_at timestamptz default '2030-01-01 05:59:59-03', agendado_para timestamptz);
      create table agente_logs(execucao_id int, nivel text, step text, mensagem text, metadata_json jsonb);
      create table agente_arquivos(execucao_id int);
      create table maestro_flow_montagens(execucao_id int);
      create table auditoria_eventos(carteira_id uuid, entidade_tipo text, entidade_id int, evento_tipo text, titulo text, descricao text, antes jsonb, depois jsonb);
    `)
    const sql = await readFile('supabase/migrations/20261123235000_maestro_limpeza_diaria.sql','utf8')
    await db.exec(sql.replaceAll('now()', "current_setting('teste.relogio')::timestamptz"))
    assert.equal((await db.query('select agenda from cron.job')).rows[0].agenda, '0 9 * * *')
    await db.exec(`
      insert into agente_execucoes(id) select generate_series(1,12);
      update agente_execucoes set easy_maestro_lote_id=gen_random_uuid(), origem='easy' where id=2;
      update agente_execucoes set created_at='2030-01-01 06:00:00-03', origem='agenda_mensal' where id=3;
      update agente_execucoes set created_at='2030-01-01 06:00:01-03' where id=4;
      update agente_execucoes set agendado_para='2030-01-01 06:01-03' where id=5;
      update agente_execucoes set origem='espelhamento' where id=6;
      update agente_execucoes set tentativas=1 where id=7;
      update agente_execucoes set status='em_execucao', iniciado_em=now() where id=8;
      insert into agente_arquivos values(9);
      insert into maestro_flow_montagens values(10);
      insert into agente_logs(execucao_id,step) values(11,'importacao_automatica');
      update agente_execucoes set origem='maestro_agendada',agendado_para='2030-01-01 06:00-03' where id=12;
      set teste.relogio='2030-01-01 05:59:59-03';
      select maestro_limpar_fila_diaria();
      update maestro_limpeza_diaria set ativa=false;
      set teste.relogio='2030-01-01 06:15-03';
      select maestro_limpar_fila_diaria();
    `)
    assert.equal((await db.query('select ultimo_corte from maestro_limpeza_diaria')).rows[0].ultimo_corte,null)
    await db.exec('update maestro_limpeza_diaria set ativa=true; select maestro_limpar_fila_diaria(); select maestro_limpar_fila_diaria();')
    assert.deepEqual((await db.query("select id from agente_execucoes where status='cancelada' order by id")).rows.map(r=>r.id),[1,2,3,12])
    assert.equal((await db.query('select cancelados from maestro_limpeza_diaria')).rows[0].cancelados,4)
    for (const query of ["select count(*)::int n from agente_logs where step='limpeza_diaria'",'select count(*)::int n from auditoria_eventos']) {
      assert.equal((await db.query(query)).rows[0].n,4)
    }
    await db.exec('set role authenticated')
    await assert.rejects(db.query('select maestro_limpar_fila_diaria()'), /permission denied/)
    await assert.rejects(db.query('update maestro_limpeza_diaria set ativa=false'), /permission denied/)
  } finally { await db.close() }
})
