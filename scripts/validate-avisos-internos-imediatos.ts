import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import ts from 'typescript'

const id=(n:number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const clock=(sql:string)=>sql.replaceAll('clock_timestamp()','public.test_now()').replaceAll('now()','public.test_now()').replaceAll('test_public.test_now()','test_now()')
async function main(){
 const db=new PGlite()
 try{
  const schema=readFileSync('scripts/validate-email-agenda.ts','utf8').split('await db.exec(`')[1].split('`)')[0]
  await db.exec(schema)
  await db.exec("create or replace function test_now() returns timestamptz language sql as 'select t from public.fake_clock';")
  await db.exec(clock(readFileSync('supabase/migrations/20260916170000_agenda_email_carteira.sql','utf8')))
  await db.exec(`create function flow_cobranca_mensagem_elegivel(m mensagens) returns boolean language sql as $$select true$$;`)
  await db.exec(clock(readFileSync('supabase/migrations/20260922190000_thunderbird_envios.sql','utf8')))
  await db.exec(`
   alter table mensagens add column contexto text,add column destinatario text,add column email_assunto text;
   create schema auth;create function auth.uid() returns uuid language sql as $$select '${id(9)}'::uuid$$;
   create table central_pendencias(id uuid primary key,tipo text,carteira_id uuid,condominio_id uuid,status text,descricao text,payload jsonb,updated_at timestamptz);
   create table acordos(id uuid primary key,unidade_id uuid,carteira_id uuid,condominio_id uuid,devedor_aceito_em timestamptz,status text);
   create table condominios(id uuid,carteira_id uuid,nome text);
   create function email_processar_agenda() returns bigint language plpgsql as $$begin
    return 123;end$$;
   create schema cron;create table cron.job(jobid bigserial,jobname text,schedule text,active boolean default true);
   insert into cron.job(jobname,schedule) values('gkli-email-agenda','*/10 12-20 * * *');
   create function cron.alter_job(p_jobid bigint,schedule text) returns void language sql as $$update cron.job set schedule=$2 where jobid=$1$$;
   create function cron.schedule(text,text,text) returns bigint language plpgsql as $$declare n bigint;begin insert into cron.job(jobname,schedule) values($1,$2) returning jobid into n;return n;end$$;
   create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);insert into vault.decrypted_secrets values('gkli_email_agenda_token','test-only');
   create schema net;create table net.requests(id bigserial,url text);
   create function net.http_get(url text,headers jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$declare n bigint;begin insert into net.requests(url) values(url) returning id into n;return n;end$$;
  `)
  await db.exec(clock(readFileSync('supabase/migrations/20261015180513_email_agenda_janela_noturna.sql','utf8')))
  const financeiro=readFileSync('scripts/validate-aceite-formalizacao.ts','utf8').split('   create function agente_virtual_negociar_acordo')[1].split('  `)')[0]
  await db.exec(clock('create function agente_virtual_negociar_acordo'+financeiro))
  for(const nome of ['20261019004657_aceite_agentes_encaminhar_humano.sql','20261019005823_avisar_operador_acordo_firmado.sql','20261019010614_aviso_operador_lidia_camila.sql','20261019012801_avisos_internos_envio_imediato.sql']) await db.exec(clock(readFileSync('supabase/migrations/'+nome,'utf8')))
  const gekali='e1f6e3ac-1098-4b30-9e0f-af4c47b351a3',genske='06827218-e2b1-4267-ad8f-81a0ab222cad'
  for(const carteira of [gekali,genske]){
   await db.query('insert into carteiras(id) values($1)',[carteira])
   await db.query('insert into condominios values($1,$2,$3)',[id(5),carteira,'Condomínio teste'])
  }
  const aceitar=async(n:number,agente='keila')=>{
   const carteira=agente==='keila'?gekali:genske
   const proposta={id:'original',unidade_id:id(n+100),unidade:String(n),etapa:'possivel_acordo',total:110,percentual:10,parcelas:[{numero:1,valor:110,vencimento:'2050-09-20'}]}
   await db.query('insert into central_pendencias values($1,$2,$3,$4,$5,$6,$7::jsonb,test_now())',[id(n),agente+'_atendimento',carteira,id(5),'em_tratamento','',JSON.stringify({estado:'proposta_preparada',acordos:[proposta],atividades:[]})])
   await db.query('select agente_virtual_negociar_acordo($1,$2,$3,$4,$5::jsonb,$6)',[agente,id(n),id(n+100),'aceitar','{}','Aceito as condições'])
   return (await db.query<{id:string;agendada_para:string}>("select id,agendada_para from mensagens where payload->>'keila_caso_id'=$1",[id(n)])).rows[0]
  }
  const primeiro=await aceitar(1)
  assert.equal(new Date(primeiro.agendada_para).toISOString(),'2050-09-16T12:00:00.000Z','Aviso agendado no instante do aceite, em horário diurno')
  assert.equal((await db.query<{n:number}>('select count(*)::int n from net.requests')).rows[0].n,1,'Trigger aciona o worker imediatamente')
  assert.match((await db.query<{url:string}>('select url from net.requests limit 1')).rows[0].url,/avisos_internos=1$/)
  const claims=await Promise.all([1,2].map(()=>db.query<{r:{permitido:boolean}}>('select email_reservar_disparo($1,$2) r',[primeiro.id,'gekali.com.br'])))
  assert.equal(claims.filter(r=>r.rows[0].r.permitido).length,1,'Concorrência só autoriza um disparo')
  await db.query("update email_tentativas set estado='enviado' where mensagem_id=$1",[primeiro.id])
  const segundo=await aceitar(2)
  assert.equal((await db.query<{r:{permitido:boolean}}>('select email_reservar_disparo($1,$2) r',[segundo.id,'gekali.com.br'])).rows[0].r.permitido,true,'Aviso não espera o intervalo de 10 minutos dos flows')
  const camila=await aceitar(3,'lidia')
  assert.equal((await db.query<{r:{permitido:boolean}}>('select email_reservar_disparo($1,$2) r',[camila.id,'genskeadvogados.com.br'])).rows[0].r.permitido,true,'Lidia também envia fora da janela')
  await db.query('insert into mensagens(id,carteira_id,contexto,destinatario) values($1,$2,$3,$4)',[id(500),gekali,'mensageria','condomino@example.com'])
  const slot=(await db.query<{slot:string}>('select email_reservar_horario($1,$2) slot',[id(500),'gekali.com.br'])).rows[0].slot
  assert.equal(new Date(slot).toISOString(),'2050-09-17T01:00:00.000Z','Demais e-mails continuam aguardando 22h')
  assert.equal((await db.query<{r:{permitido:boolean}}>('select email_reservar_disparo($1,$2) r',[id(500),'gekali.com.br'])).rows[0].r.permitido,false)
  for(const campo of ["destinatario='outro@example.com'","payload=payload||jsonb_build_object('email_cc',jsonb_build_array('outro@example.com'))","carteira_id='"+genske+"'::uuid","cobranca_flow_id='"+id(99)+"'::uuid"]){
   await db.exec('begin')
   await db.exec('update mensagens set '+campo+" where id='"+primeiro.id+"'")
   assert.equal((await db.query<{ok:boolean}>('select email_aviso_interno_autorizado(m) ok from mensagens m where id=$1',[primeiro.id])).rows[0].ok,false,'Não basta copiar a tag de aviso: '+campo)
   await db.exec('rollback')
  }
  // Reservations for ordinary overnight mail cannot postpone an internal handoff.
  for(let n=600;n<650;n++){
   await db.query("insert into mensagens(id,carteira_id,status) values($1,$2,'agendada')",[id(n),gekali])
   await db.query("insert into email_agenda values($1,$2,'gekali.com.br','2050-09-17T01:00Z')",[id(n),gekali])
  }
  const prioridade=await aceitar(6)
  assert.equal(new Date(prioridade.agendada_para).toISOString(),'2050-09-16T12:00:00.000Z','Aviso tem prioridade sobre reservas de flows ainda não enviadas')
  const antes=(await db.query<{n:number}>('select count(*)::int n from net.requests')).rows[0].n
  await db.exec('begin');await aceitar(4);await db.exec('rollback')
  assert.equal((await db.query<{n:number}>('select count(*)::int n from net.requests')).rows[0].n,antes,'Rollback não deixa pedido de envio')
  await db.query('update carteiras set email_limite_diario=2 where id=$1',[gekali])
  const limitado=await aceitar(5)
  assert.equal(new Date(limitado.agendada_para).toISOString(),'2050-09-17T03:00:00.000Z','Cota diária preservada, sem aguardar a janela noturna seguinte')
  await db.query("update email_tentativas set estado='incerto' where mensagem_id=$1",[segundo.id])
  await assert.rejects(db.query('select email_reservar_horario($1,$2)',[segundo.id,'gekali.com.br']),/tentativa/)
  assert.equal((await db.query<{ok:boolean}>("select has_function_privilege('authenticated','email_processar_avisos_internos()','execute') ok")).rows[0].ok,false)
  assert.equal((await db.query<{schedule:string}>("select schedule from cron.job where jobname='gkli-email-agenda'")).rows[0].schedule,'*/10 1-8 * * *','Cron comum continua noturno')
 }finally{await db.close()}

 let noite=false;const filtros:string[]=[]
 const q={select(){return q},neq(){return q},eq(){return q},is(){return q},lte(){return q},order(){return q},limit(){return q},in(c:string){filtros.push(c);return q},then(resolve:(r:unknown)=>unknown){return Promise.resolve({data:[]}).then(resolve)}}
 const compiled=ts.transpileModule(readFileSync('features/mensageria/email-dispatcher.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 const exp:Record<string,(...args:unknown[])=>Promise<unknown>>={}
 new Function('require','exports',compiled)((name:string)=>name.includes('supabase/admin')?{createAdminClient:()=>({from:()=>q})}:name.includes('email-janela')?{emailHorarioPermitido:()=>noite}:{},exp)
 await exp.executarDisparosEmail();assert.equal(filtros.length,1,'Worker diurno só consulta avisos internos')
 noite=true;await exp.executarDisparosEmail();assert.equal(filtros.length,1,'Worker noturno preserva fila comum')
 await exp.executarDisparosEmail(50,undefined,true);assert.equal(filtros.length,2,'Acionamento imediato é restrito a avisos mesmo à noite')
 console.log('Avisos internos imediatos: trigger, envio diurno, isolamento, concorrência, rollback, limites e janela comum preservada: OK')
}
main().catch(e=>{console.error(e);process.exitCode=1})
