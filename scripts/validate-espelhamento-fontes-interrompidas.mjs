import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('reconcilia só fontes da operação com falha, sem atividade ou efeitos', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema cron; create function cron.schedule(text,text,text) returns int language sql as 'select 1';
      create table easy_espelhamentos(id uuid primary key,estado text,condominio_id int,carteira_id int,concluido_em timestamptz);
      create table agente_execucoes(id int primary key,receita_id int default 1,condominio_id int default 1,carteira_id int default 1,status text default 'em_execucao',origem text default 'espelhamento',created_at timestamptz default now()-interval '2 days',iniciado_em timestamptz,finalizado_em timestamptz,erro_mensagem text);
      create table easy_espelhamento_fontes(espelhamento_id uuid,execucao_id int,receita_id int);
      create table agente_workers(metadata_json jsonb,ultimo_sinal_em timestamptz);
      create table agente_arquivos(execucao_id int); create table maestro_flow_montagens(execucao_id int);
      create table agente_logs(execucao_id int,nivel text,step text,mensagem text,metadata_json jsonb,created_at timestamptz default now());
      create table auditoria_eventos(carteira_id int,entidade_tipo text,entidade_id int,evento_tipo text,titulo text,descricao text,antes jsonb,depois jsonb);
      create function easy_maestro_painel(uuid[], text) returns jsonb language sql as $f$
        select jsonb_build_object('solicitadaEm', e.created_at,'detalhe', case when e.status='pendente' then 'Pedido já em andamento no Maestro.' end)
        from agente_execucoes e limit 1
      $f$;
      insert into easy_espelhamentos values(gen_random_uuid(),'processando',1,1,null);
      insert into agente_execucoes(id) select generate_series(1,9);
      insert into easy_espelhamento_fontes select s.id,e.id,1 from easy_espelhamentos s cross join agente_execucoes e;
      update agente_execucoes set status='pendente' where id=1;
      insert into agente_workers values('{"execucao_id":"3"}',now());
      insert into agente_arquivos values(4);
      insert into maestro_flow_montagens values(5);
      insert into agente_logs(execucao_id,step) values(6,'login');
      update agente_execucoes set origem='maestro' where id=7;
      update agente_execucoes set carteira_id=2 where id=8;
      insert into agente_logs(execucao_id,step,created_at) values(9,'importacao_automatica',now()-interval '2 days');
    `)
    await db.exec(await readFile('supabase/migrations/20261124000500_espelhamento_reconciliar_fontes.sql','utf8'))
    await db.exec("update easy_espelhamentos set estado='falha',concluido_em=now()")
    assert.deepEqual((await db.query('select status from agente_execucoes where id in (1,2) order by id')).rows.map(r=>r.status),['cancelada','precisa_intervencao'])
    assert.equal((await db.query('select count(*)::int n from auditoria_eventos')).rows[0].n,2)
    await db.exec("update agente_workers set ultimo_sinal_em=now()-interval '1 hour'; update agente_logs set created_at=now()-interval '1 hour' where execucao_id=6")
    assert.equal((await db.query('select espelhamento_reconciliar_fontes() n')).rows[0].n,2)
    assert.equal((await db.query('select espelhamento_reconciliar_fontes() n')).rows[0].n,0)
    assert.deepEqual((await db.query('select id from agente_execucoes where finalizado_em is null order by id')).rows.map(r=>r.id),[4,5,7,8,9])
    await db.exec('set role authenticated')
    await assert.rejects(db.query('select espelhamento_reconciliar_fontes()'), /permission denied/)
  } finally { await db.close() }
})
