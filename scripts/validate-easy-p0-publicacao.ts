import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {fixtureFlow} from './easy-flow-transaction-fixture';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

test('manifesto P0 é prefixo do conjunto P0/P1 e snapshot corresponde às sete migrations',async()=>{
  const manifesto=JSON.parse(await readFile('docs/easy-p0-migrations.json','utf8'));
  const esperadas=['20261118205314_easy_p0_contencao.sql','20261118211109_easy_cap_commit_transacional.sql','20261118220528_easy_flow_transacional.sql'].map(x=>'supabase/migrations/'+x);
  assert.deepEqual(manifesto.migrations.map((x:any)=>x.path),esperadas);
  const conjunto=JSON.parse(await readFile('docs/easy-p0-p1-migrations.json','utf8'));
  assert.equal(conjunto.migrations.length,7);
  assert.deepEqual(conjunto.migrations.slice(0,3),manifesto.migrations);
  const diff=execFileSync('git',['diff','--name-only',conjunto.base,conjunto.released,'--','supabase/migrations'],{encoding:'utf8'}).trim().split(/\r?\n/).sort();
  assert.deepEqual(diff,conjunto.migrations.map((x:any)=>x.path).sort());
  const gerado=await readFile('lib/backup/schema-files.generated.ts','utf8');
  const snapshot=JSON.parse(gerado.slice(gerado.indexOf('= ')+2));
  for(const entrada of conjunto.migrations){
    const sql=(await readFile(entrada.path,'utf8')).replace(/\r\n/g,'\n');
    assert.equal(createHash('sha256').update(sql).digest('hex'),entrada.sha256);
    assert.equal(snapshot.find((x:any)=>x.name==='schema/migrations/'+entrada.path.split('/').at(-1))?.content,sql);
  }
});

test('diagnósticos de publicação são somente leitura e verificam schema/grants instalados',async()=>{
  const db=await fixtureFlow();try{
    // Dependências não exercidas pelas fixtures de negócio; nunca acessam rede.
    await db.exec(`create function email_reservar_horario(uuid,text,timestamptz) returns timestamptz language sql as 'select $3';
      create function email_smtp_candidatas(uuid) returns table(config_id uuid,conta text,preferencia integer) language sql as 'select null::uuid,null::text,0 where false';`);
    const antes=await db.query("select (select count(*) from cobrancas) cobrancas,(select count(*) from mensagens) mensagens,(select count(*) from easy_flow_eventos) eventos");
    for(const file of ['scripts/easy-p0-preflight.sql','scripts/easy-p0-pos-migrations.sql'])await db.exec(await readFile(file,'utf8'));
    const depois=await db.query("select (select count(*) from cobrancas) cobrancas,(select count(*) from mensagens) mensagens,(select count(*) from easy_flow_eventos) eventos");
    assert.deepEqual(depois.rows,antes.rows);
    await db.exec('grant select on easy_flow_partes to authenticated');
    await assert.rejects(db.exec(await readFile('scripts/easy-p0-pos-migrations.sql','utf8')),/acesso público/);
    await db.exec('rollback');
    await db.exec('revoke select on easy_flow_partes from authenticated; alter table condominios drop column vencimento_cota_dia');
    await assert.rejects(db.exec(await readFile('scripts/easy-p0-preflight.sql','utf8')),/coluna ausente/);
    await db.exec('rollback');
  }finally{await db.close();}
});
