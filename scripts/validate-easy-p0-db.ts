import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {fixtureEasyP0,fixtureId,inserirExecucao,migrationP0} from './easy-p0-fixture';

test('atenção preserva o bloqueio no banco; estados terminais e outro condomínio não bloqueiam',async()=>{
  const db=await fixtureEasyP0();
  try {
    await db.exec(await readFile(migrationP0,'utf8'));
    await inserirExecucao(db,10,'montando');
    await db.query("update easy_flow_execucoes set status='atencao' where id=$1",[fixtureId(10)]);
    await assert.rejects(()=>inserirExecucao(db,11),/easy_flow_condominio_em_andamento/);
    assert.equal((await db.query('select id from easy_flow_execucoes')).rows.length,1);
    await inserirExecucao(db,12,'concluido');
    await inserirExecucao(db,13,'cancelado');
    await inserirExecucao(db,14,'preview',3);
    const claims=await Promise.allSettled([inserirExecucao(db,15,'preview',3),inserirExecucao(db,16,'preview',3)]);
    assert.equal(claims.filter(c=>c.status==='fulfilled').length,0);
    await db.exec('set role authenticated');
    await assert.rejects(()=>db.query('select * from easy_flow_execucoes'),/permission denied/);
  } finally {await db.close();}
});

test('tentativas de reserva disputam a mesma constraint, sem duplicar execução',async()=>{
  const db=await fixtureEasyP0();
  try {
    await db.exec(await readFile(migrationP0,'utf8'));
    const attempts=await Promise.allSettled([inserirExecucao(db,10),inserirExecucao(db,11)]);
    assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);
    assert.equal((await db.query<{n:number}>('select count(*)::int n from easy_flow_execucoes')).rows[0].n,1);
    // PGlite serializa a conexão: corrida entre sessões reais é uma verificação posterior.
  } finally {await db.close();}
});

test('preflight aborta migration com histórico conflitante sem corrigir ou apagar dados',async()=>{
  const db=await fixtureEasyP0();
  try {
    await inserirExecucao(db,10,'atencao');await inserirExecucao(db,11,'preview');
    const sql=await readFile(migrationP0,'utf8');
    await assert.rejects(()=>db.exec(sql),/execuções Easy Flow conflitantes/);
    await db.exec('rollback');
    assert.equal((await db.query<{n:number}>('select count(*)::int n from easy_flow_execucoes')).rows[0].n,2);
    assert.equal((await db.query<{installed:string|null}>("select to_regprocedure('easy_p0_contencao_versao()') installed")).rows[0].installed,null);
    const definition=(await db.query<{indexdef:string}>("select indexdef from pg_indexes where indexname='easy_flow_condominio_em_andamento'")).rows[0].indexdef;
    assert.equal(definition.includes('atencao'),false);
  } finally {await db.close();}
});

test('RPC antiga está suspensa inclusive para service_role; papéis públicos não a executam',async()=>{
  const db=await fixtureEasyP0();
  try {
    await db.exec(await readFile(migrationP0,'utf8'));
    await db.exec('set role service_role');
    assert.equal((await db.query<{version:number}>('select easy_p0_contencao_versao() version')).rows[0].version,1);
    await assert.rejects(()=>db.query('select easy_preparar_captacao($1,$2)',[fixtureId(20),'v1']),/EASY_CAP_CONFIRMATION_PAUSED/);
    await db.exec('reset role');
    assert.equal((await db.query<{valor:string}>('select valor::text from financial_probe')).rows[0].valor,'123.45');
    for(const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(()=>db.query('select easy_p0_contencao_versao()'),/permission denied/);
      await assert.rejects(()=>db.query('select easy_preparar_captacao($1,$2)',[fixtureId(20),'v1']),/permission denied/);
      await db.exec('reset role');
    }
  } finally {await db.close();}
});
