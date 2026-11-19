import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,randomInt,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
const {fixtureOperacional}=require('./easy-p1-operacional-fixture.ts');
const {fixtureId:id}=require('./easy-p0-fixture.ts');
const {Client}=createRequire(resolve(process.argv[3],'package.json'))('pg');
const bin=resolve(process.argv[2]);
const root=await mkdtemp(join(tmpdir(),'easy-maestro-load-'));
const data=join(root,'data'),password=randomBytes(32).toString('hex'),port=randomInt(30000,59000);
const run=(name,args)=>execFileSync(join(bin,name+'.exe'),args,{windowsHide:true,stdio:'ignore'});
const clients=[];
let started=false;
try{
  await writeFile(join(root,'pw'),password);
  run('initdb',['-D',data,'-U','lab','--encoding=UTF8','--locale=C','--no-sync','--auth=scram-sha-256','--pwfile='+join(root,'pw')]);
  run('pg_ctl',['start','-D',data,'-l',join(root,'server.log'),'-o','-h 127.0.0.1 -p '+port+' -c track_commit_timestamp=on','-w']);
  started=true;
  async function connect(database){
    const c=new Client({host:'127.0.0.1',port,user:'lab',password,database});
    await c.connect();clients.push(c);return c;
  }
  const chain=await connect('postgres');
  console.log((await chain.query('show server_version')).rows[0]);
  const files=(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort();
  for(const [index,file] of files.entries()){
    try{await chain.query(await readFile(join('supabase/migrations',file),'utf8'));}
    catch(e){console.log({chainTotal:files.length,applied:index,file,code:e.code,error:e.message});process.exitCode=2;await chain.query('rollback');break;}
  }
  await chain.query('create database carga');
  const owner=await connect('carga');
  await fixtureOperacional({exec:owner.query.bind(owner),query:owner.query.bind(owner)});
  // Instrument only the disposable function definitions. Timepoints stay local to each transaction.
  for(const name of ['easy_maestro_validar_execucao','easy_maestro_captar_confirmado']){
    const {rows}=await owner.query('select pg_get_functiondef(oid) as src from pg_proc where proname=$1',[name]);
    assert.equal(rows.length,1);
    const src=rows[0].src.replace(/perform pg_advisory_xact_lock/i,"perform set_config('lab.entry',clock_timestamp()::text,true); perform pg_advisory_xact_lock").replace(/lock table public\.profiles[^;]+;/i,lock=>
      "perform set_config('lab.before',clock_timestamp()::text,true);\n"+lock+"\nperform set_config('lab.acquired',clock_timestamp()::text,true);");
    assert.notEqual(src,rows[0].src);await owner.query(src);
  }
  await owner.query("insert into condominios(id,carteira_id,status,administradora) select gen_random_uuid(),$1,'ativo','sintetica' from generate_series(1,499)",[id(1)]);
  await owner.query("insert into agente_receitas select gen_random_uuid(),$1,true,'lab',jsonb_build_object('condominio_id',id::text) from condominios where id<>$2",[id(9),id(2)]);
  await owner.query("insert into reguas select gen_random_uuid(),$1,'cobranca','Sintética',true,'ativa' from generate_series(1,30)",[id(1)]);
  await owner.query("insert into regua_etapas select gen_random_uuid(),r.id,'email',true,i,i from reguas r cross join generate_series(1,5) i");
  await owner.query("insert into mensagens_templates select gen_random_uuid(),repeat('x',512) from generate_series(1,100)");
  await owner.query('analyze');
  const ids=(await owner.query('select id from condominios order by id')).rows.map(r=>r.id);
  const workers=await Promise.all(Array.from({length:4},()=>connect('carga')));
  function summary(xs){xs.sort((a,b)=>a-b);return {n:xs.length,p50:xs[Math.ceil(xs.length*.5)-1],p95:xs[Math.ceil(xs.length*.95)-1],max:xs.at(-1)};}
  for(const size of [10,100,500]){
    const selection=ids.slice(0,size),actor=id(10);
    const args=[actor,'sintetica',selection,true];
    const effects=(await owner.query('select easy_maestro_efeitos($1,$2,$3,$4) e',args)).rows[0].e;
    const metrics={pedido:[],claim:[]};
    async function timed(c,kind,sql,params){
      await c.query('begin');
      try{
        await c.query(sql,params);
        const {rows:[t]}=await c.query("select pg_current_xact_id()::text xid,coalesce(nullif(current_setting('lab.entry',true),''),current_setting('lab.before')) entry,current_setting('lab.before') b,current_setting('lab.acquired') a");
        await c.query('commit');
        const {rows:[m]}=await c.query('select extract(epoch from ($1::timestamptz-$2::timestamptz))*1000 wait,extract(epoch from(pg_xact_commit_timestamp($3::xid)-$1::timestamptz))*1000 held,extract(epoch from ($1::timestamptz-$4::timestamptz))*1000 totalwait',[t.a,t.b,t.xid,t.entry]);
        metrics[kind].push([Number(m.wait),Number(m.held),Number(m.totalwait)]);
      }catch(e){await c.query('rollback');throw e;}
    }
    for(let round=0;round<8;round++){
      const batches=workers.map(()=>randomUUID());
      await Promise.all(workers.map((c,i)=>timed(c,'pedido','select easy_maestro_captar_confirmado($1,$2,$3,$4,$5,$6,$7)',[actor,'sintetica',batches[i],true,selection,effects.versao,effects.ativacaoAutomatica])));
      const editor=owner.query("update maestro_flow_controle set ativo=ativo where carteira_id=$1",[id(1)]);
      await Promise.all(workers.map((c,i)=>timed(c,'claim',"update agente_execucoes set status='em_execucao' where id=(select id from agente_execucoes where easy_maestro_lote_id=$1 limit 1)",[batches[i]])));
      await editor;
    }
    for(const [kind,rows] of Object.entries(metrics))console.log(JSON.stringify({size,kind,wait_ms:summary(rows.map(r=>r[0])),all_lock_wait_ms:summary(rows.map(r=>r[2])),held_ms:summary(rows.map(r=>r[1]))}));
  }
}finally{
  await Promise.all(clients.map(c=>c.end()));
  if(started)run('pg_ctl',['stop','-D',data,'-m','fast','-w']);
  await rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
