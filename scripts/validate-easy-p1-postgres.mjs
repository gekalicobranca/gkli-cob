import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {randomBytes,randomInt} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
const {fixtureCancelamento}=createRequire(import.meta.url)('./easy-p1-cancelamento-fixture.ts');
const {fixtureOperacional}=createRequire(import.meta.url)('./easy-p1-operacional-fixture.ts');
const {iniciarFlow}=createRequire(import.meta.url)('./easy-flow-transaction-fixture.ts');
const {fixtureId:id}=createRequire(import.meta.url)('./easy-p0-fixture.ts');

const requireLab=createRequire(resolve(process.argv[2],'package.json'));
const {default:Embedded}=await import((await import('node:url')).pathToFileURL(requireLab.resolve('embedded-postgres')).href);
async function lab(test){
  const databaseDir=await mkdtemp(join(tmpdir(),'easy-concorrencia-'));
  const port=randomInt(30000,59000);
  const ctl=join(resolve(process.argv[2]),'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe');
  const pg=new Embedded({databaseDir,user:'lab',password:randomBytes(24).toString('hex'),port,persistent:true,initdbFlags:['--no-sync','--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
  await pg.initialise();
  execFileSync(ctl,['start','-D',databaseDir,'-l',join(databaseDir,'lab.log'),'-o','-h 127.0.0.1 -p '+port,'-w'],{windowsHide:true,stdio:'ignore'});
  const clients=[];
  try {
    for(let i=0;i<3;i++){const c=pg.getPgClient('postgres','127.0.0.1');await c.connect();clients.push(c);}
    const [a,b,observer]=clients;
    console.log((await observer.query('show server_version')).rows[0]);
    const db={exec:a.query.bind(a),query:a.query.bind(a)};
    async function race(name,prepare,compete,expected){
      await a.query('begin');
      try {
        await prepare();
        const pending=compete().then(result=>({result}),error=>({error}));
        let blocked=false;
        try {
          for(let i=0;i<120;i++){
            const {rows}=await observer.query('select $1::int=any(pg_blocking_pids($2)) as blocked',[a.processID,b.processID]);
            if(rows[0].blocked){blocked=true;break;}await delay(15);
          }
        }finally{await a.query('commit');}
        const outcome=await pending;
        assert.ok(blocked,name+' sem espera observada');
        if(expected)assert.match(outcome.error?.message??'',expected);else if(outcome.error)throw outcome.error;
        console.log('PASS',name,a.processID,b.processID);
      }catch(error){await a.query('rollback');throw error;}
    }
    await test(db,a,b,race);
  }finally{await Promise.all(clients.map(c=>c.end()));execFileSync(ctl,['stop','-D',databaseDir,'-m','fast','-w'],{windowsHide:true,stdio:'ignore'});await rm(databaseDir,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
}
await lab(async(db,a,b,race)=>{
  const f=await fixtureCancelamento(db);
  const pay="update parcelas_acordo set valor_pago=10 where id=$1";
  const cancel=()=>b.query('select acordo_cancelar_formalizacao_atomico($1,$2,$3,$4)',[id(70),id(40),id(10),'Sintético']);
  await race('pagamento antes do cancelamento',()=>a.query(pay,[id(50)]),cancel,/pagamento/i);
  assert.equal((await a.query('select * from acordo_cancelamentos')).rowCount,0);
  await a.query('update parcelas_acordo set valor_pago=null');
  await race('cancelamento antes do pagamento',()=>f.cancelar(),()=>b.query(pay,[id(50)]),/concilia|cancelad/i);
  assert.equal((await a.query('select * from acordo_cancelamentos')).rowCount,1);
  assert.equal((await a.query('select * from parcelas_acordo where valor_pago>0')).rowCount,0);
});
await lab(async(db,a,b,race)=>{
  const f=await fixtureOperacional(db);
  await f.solicitar(await f.conferir());
  await race('configuração antes do claim',()=>a.query('update maestro_flow_controle set ativo=true'),()=>b.query("update agente_execucoes set status='em_execucao'"),/Configuração/);
  assert.equal((await a.query('select status from agente_execucoes')).rows[0].status,'pendente');
  await a.query('update agente_receitas set ativo=false');
  const flow=await iniciarFlow(db);
  for(const [nome,apply] of [['montagem',()=>flow.montar()],['liberação',()=>flow.liberar()]]){
    const args=[flow.run.id,id(11)];
    const {rows}=await a.query('select easy_flow_admin_conferir($1,$2) as r',args);
    await race(nome+' antes da reconciliação',apply,()=>b.query('select easy_flow_admin_reconciliar($1,$2,$3,$4,$5)',[...args,rows[0].r.versao,'Conferência sintética',id(93)]),/mudou/);
    assert.equal((await a.query('select * from email_agenda')).rowCount,nome==='montagem'?0:1);
  }
});
